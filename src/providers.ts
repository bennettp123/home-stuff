import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

export const providers: {
    [region: string]: pulumi.ProviderResource
} = {
    'us-east-1': new aws.Provider('us-east-1', {
        region: 'us-east-1',
        profile: process.env.AWS_PROFILE,
    }),
    'us-east-2': new aws.Provider('us-east-2', {
        region: 'us-east-2',
        profile: process.env.AWS_PROFILE,
    }),
}
