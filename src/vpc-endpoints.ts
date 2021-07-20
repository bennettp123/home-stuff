import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

export class VpcEndpoints extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            vpcId: pulumi.Input<string>
            subnetIds: pulumi.Input<string[]>
            securityGroupIds: pulumi.Input<string>[]
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:vpc-endpoints/VpcEndpoints', name, {}, opts)

        new aws.ec2.VpcEndpoint(
            `${name}-s3`,
            {
                vpcId: args.vpcId,
                serviceName: 'com.amazonaws.ap-southeast-2.s3',
                vpcEndpointType: 'Gateway',
                securityGroupIds: args.securityGroupIds,
                privateDnsEnabled: true,
            },
            { parent: this },
        )

        new aws.ec2.VpcEndpoint(
            `${name}-ecr-api`,
            {
                vpcId: args.vpcId,
                serviceName: 'com.amazonaws.ap-southeast-2.ecr.api',
                vpcEndpointType: 'Interface',
                subnetIds: args.subnetIds,
                securityGroupIds: args.securityGroupIds,
                privateDnsEnabled: true,
            },
            { parent: this },
        )

        new aws.ec2.VpcEndpoint(
            `${name}-ecr-dkr`,
            {
                vpcId: args.vpcId,
                serviceName: 'com.amazonaws.ap-southeast-2.ecr.dkr',
                vpcEndpointType: 'Interface',
                subnetIds: args.subnetIds,
                securityGroupIds: args.securityGroupIds,
                privateDnsEnabled: true,
            },
            { parent: this },
        )
    }
}
