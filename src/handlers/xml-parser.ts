import { S3 } from "aws-sdk";
import { S3Event } from "aws-lambda";
import { XMLParser } from "fast-xml-parser";

const s3 = new S3();
const parser = new XMLParser();

export const xmlParserHandler = async (event: S3Event) => {
  for await (const record of event.Records) {
    console.log("Event Name: %s", record.eventName);
    console.log("S3 Request: %j", record.s3);

    const rawS3 = await s3
      .getObject({
        Key: record.s3.object.key,
        Bucket: "rb-api-target-xml-bucket",
      })
      .promise();

    const data = rawS3.Body?.toString("utf-8") || "";
    console.log(data);
    console.log(parser.parse(data));
  }
};
