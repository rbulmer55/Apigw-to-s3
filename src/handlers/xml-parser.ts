import { S3 } from "aws-sdk";
import { S3Event } from "aws-lambda";
import { XMLParser } from "fast-xml-parser";

const s3 = new S3();
const parser = new XMLParser();

export const xmlParserHandler = async (event: S3Event) => {
  const { BUCKET_NAME: bucketName } = process.env;

  for await (const record of event.Records) {
    console.log("Event Name: %s", record.eventName);
    console.log("S3 Request: %j", record.s3);

    const rawS3 = await s3
      .getObject({
        Key: record.s3.object.key,
        Bucket: bucketName || "",
      })
      .promise();

    const data = rawS3.Body?.toString("utf-8") || "";
    console.log(data);
    console.log(parser.parse(data));
  }
};
