import * as aws from "@pulumi/aws"

new aws.s3.Bucket("state-bucket", {
    acl: "private",
    bucket: "home-stuff-bennettp123",
    forceDestroy: false,
    serverSideEncryptionConfiguration: {
        rule: {
            applyServerSideEncryptionByDefault: {
                sseAlgorithm: "AES256",
            },
        },
    },
}, {
    protect: true,
})

const key = new aws.kms.Key("pulumi-key", {
    customerMasterKeySpec: "SYMMETRIC_DEFAULT",
    enableKeyRotation: false,
    isEnabled: true,
    keyUsage: "ENCRYPT_DECRYPT",
}, {
    protect: true,
})

const alias = new aws.kms.Alias("pulumi-homestuff", {
    name: "alias/pulumi-homestuff",
    targetKeyId: key.keyId,
}, {
    protect: true,
})
