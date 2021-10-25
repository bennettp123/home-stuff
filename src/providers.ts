import * as aws from '@pulumi/aws'

export const providers = {
    'us-east-1': new aws.Provider('us-east-1', {
        region: 'us-east-1',
        profile: process.env.AWS_PROFILE,
    }),
}
