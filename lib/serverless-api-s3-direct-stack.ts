import { join } from "path";
import { Construct } from "constructs";
import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { Role, ServicePrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  AuthorizationType,
  EndpointType,
  PassthroughBehavior,
  RestApi,
  AwsIntegration,
  MethodOptions,
  UsagePlan,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";

export class ServerlessApiS3DirectStack extends Stack {
  public readonly apiGatewayRole: Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a target bucket to drop XML data into
    const targetBucket = new Bucket(this, "api-target-xml-bucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    //Create a new hanlder to parse the XML files
    const xmlParserHandler: NodejsFunction = new NodejsFunction(
      this,
      "XmlParserLambda",
      {
        functionName: "xml-parser-handler",
        runtime: Runtime.NODEJS_14_X,
        entry: join(__dirname, "/../src/handlers/xml-parser.ts"),
        memorySize: 1024,
        handler: "xmlParserHandler",
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: { BUCKET_NAME: targetBucket.bucketName },
      }
    );

    // Create an event trigger for the lambda when new objects created (inc PUT)
    targetBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(xmlParserHandler)
    );

    // Allow lambda to read the objects in the bucket
    targetBucket.grantRead(xmlParserHandler);

    // Create a new REST API
    const XmlApi = new RestApi(this, "s3IngressApi", {
      restApiName: "Serverless S3 API",
      description: "Forward requests direct to S3",
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
      binaryMediaTypes: ["application/xml"],
      deployOptions: {
        loggingLevel: MethodLoggingLevel.ERROR,
      },
    });

    // Add API resources
    const productResource = XmlApi.root.addResource("product");
    // Add bucket name path
    const productBucketResource = productResource.addResource("{bucketName}");
    // Add product code path
    const productBucketKeyResource =
      productBucketResource.addResource("{objectKey}");

    // Create IAM Role for API Gateway
    this.apiGatewayRole = new Role(this, "api-gateway-role", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    // Allow Apigw to use PutObject
    this.apiGatewayRole.addToPolicy(
      new PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [targetBucket.bucketArn + "/*"],
      })
    );

    // Create the new integration method
    const putObjectIntegrationUserSpecified: AwsIntegration =
      new AwsIntegration({
        service: "s3",
        region: "eu-west-1",
        path: "{bucket}/{object}",
        integrationHttpMethod: "PUT",
        options: {
          credentialsRole: this.apiGatewayRole,
          // Passes the request body to S3 without transformation
          passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
          // Map the path parameters to the S3 integration
          requestParameters: {
            // use the bucket name in the request path
            "integration.request.path.bucket": "method.request.path.bucketName",
            // use the object key in the request path
            "integration.request.path.object": "method.request.path.objectKey",
            "integration.request.header.Accept": "method.request.header.Accept",
          },
          integrationResponses: [
            {
              statusCode: "200",
              responseParameters: {
                "method.response.header.Content-Type":
                  "integration.response.header.Content-Type",
              },
            },
          ],
        },
      });

    // Create the endpoint method options
    const putObjectUserSpecifiedMethodOptions: MethodOptions = {
      // Protected by API Key
      authorizationType: AuthorizationType.NONE,
      // Require the API Key on all requests
      apiKeyRequired: true,
      requestParameters: {
        "method.request.path.bucketName": true,
        "method.request.path.objectKey": true,
        "method.request.header.Accept": true,
        "method.request.header.Content-Type": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": true,
          },
        },
      ],
    };

    // assign the integration to /product/{bucket}/{key} resource
    productBucketKeyResource.addMethod(
      "PUT",
      putObjectIntegrationUserSpecified,
      putObjectUserSpecifiedMethodOptions
    );

    // Create new Integration method
    const putObjectIntegrationAutoName: AwsIntegration = new AwsIntegration({
      service: "s3",
      region: "eu-west-1",
      integrationHttpMethod: "PUT",
      path: "{bucket}/{object}",
      options: {
        credentialsRole: this.apiGatewayRole,
        // Passes the request body to S3 without transformation
        passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
        requestParameters: {
          // Specify the bucket name from the XML bucket we created above
          "integration.request.path.bucket": `'${targetBucket.bucketName}'`,
          // Specify the object name using the APIG context requestId
          "integration.request.path.object": "context.requestId",
          "integration.request.header.Accept": "method.request.header.Accept",
        },
        // Return a 200 response after saving to S3
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type":
                "integration.response.header.Content-Type",
            },
          },
        ],
      },
    });

    // Create the endpoint method options
    const putObjectMethodOptionsAutoName: MethodOptions = {
      // Protected by API Key
      authorizationType: AuthorizationType.NONE,
      // Require the API Key on all requests
      apiKeyRequired: true,
      requestParameters: {
        "method.request.header.Accept": true,
        "method.request.header.Content-Type": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": true,
          },
        },
      ],
    };

    // assign the integration to /product resource
    productResource.addMethod(
      "PUT",
      putObjectIntegrationAutoName,
      putObjectMethodOptionsAutoName
    );

    // Secure the API with an API Key
    const apiKey = XmlApi.addApiKey("XmlApiKey", {
      apiKeyName: "s3IngressApiKey",
      value: "MyApiKeyThatIsAtLeast20Characters",
    });

    // Create a Usage plan for the API Key
    const plan = new UsagePlan(this, "XmlApiUsagePlan", {
      description: "test usage plan",
    });

    // Connect the plan and Api Key
    plan.addApiKey(apiKey);
    // Add the usage plan to the Api
    plan.addApiStage({
      stage: XmlApi.deploymentStage,
    });
  }
}
