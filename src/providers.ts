import * as aws from '@pulumi/aws'
import * as awsNative from '@pulumi/aws-native'

export const providers = {
    'us-east-1': new aws.Provider('us-east-1', {
        region: 'us-east-1',
    }),
}

export const awsNativeProviders = {
    'us-east-1': new awsNative.Provider('us-east-1', {
        region: 'us-east-1',
    }),
}
