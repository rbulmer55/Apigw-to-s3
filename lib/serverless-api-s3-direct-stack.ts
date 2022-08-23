import { Stack, StackProps } from "aws-cdk-lib";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { Role, ServicePrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  AuthorizationType,
  EndpointType,
  PassthroughBehavior,
  RestApi,
  AwsIntegration,
  MethodOptions,
  UsagePlan,
} from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";

export class ServerlessApiS3DirectStack extends Stack {
  public readonly apiGatewayRole: Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
      }
    );

    // Create a target bucket to drop XML data into
    const targetBucket = new Bucket(this, "api-target-xml-bucket", {
      bucketName: "rb-api-target-xml-bucket",
    });

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
    });

    // Add API resources
    const productResource = XmlApi.root.addResource("product");
    // Add bucket name path
    const productBucketResource = productResource.addResource("{bucket}");
    // Add product code path
    const productBucketItemResource =
      productBucketResource.addResource("{procode}");

    // Create IAM Role for API Gateway
    this.apiGatewayRole = new Role(this, "api-gateway-role", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    // Allow Apigw to use PutObject
    this.apiGatewayRole.addToPolicy(
      new PolicyStatement({
        actions: ["s3:PutObject"],
        //resources: [targetBucket.bucketArn], For some reason not working?
        resources: ["*"],
      })
    );
    // Create PutObject method
    const putObjectIntegration = new AwsIntegration({
      service: "s3",
      region: "eu-west-1",
      path: "{bucket}/{object}",
      integrationHttpMethod: "PUT",
      options: {
        credentialsRole: this.apiGatewayRole,
        passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        // Map the path parameters to the S3 integration
        requestParameters: {
          "integration.request.path.bucket": "method.request.path.bucket",
          "integration.request.path.object": "method.request.path.procode",
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

    //PutObject method options
    const putObjectMethodOptions: MethodOptions = {
      authorizationType: AuthorizationType.NONE,
      apiKeyRequired: true,
      requestParameters: {
        "method.request.path.bucket": true,
        "method.request.path.procode": true,
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

    // Add the API method
    const diS3Method = productBucketItemResource.addMethod(
      "PUT",
      putObjectIntegration,
      putObjectMethodOptions
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
