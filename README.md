# Direct APIGW Integration with S3 on Object Creation

![arch](./docs/arch.png "Architecture")

## Testing

```
curl --location --request PUT 'https://{API_ID}.execute-api.eu-west-1.amazonaws.com/prod/product/rb-api-target-xml-bucket/p1234' \
--header 'Content-Type: application/xml' \
--header 'x-api-key: MyApiKeyThatIsAtLeast20Characters' \
--data-raw '<Products ExportSize="Minimum">
        <Product>
            <AssetCrossReference Type="Primary Image"/>
            <AssetCrossReference Type="Image 02"/>
        </Product>
    </Products>'
```

> Replace the bucket name also with the one you have created in the stack

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
