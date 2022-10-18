import * as awsx from '@pulumi/awsx'
import * as pulumi from '@pulumi/pulumi'

export class DefaultRoutes extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            interfaceId: pulumi.Input<string>
            vpc: awsx.ec2.Vpc
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:default-routes/DefaultRoutes', name, args, opts)

        pulumi.output(args.vpc.privateSubnets).apply((subnets) =>
            subnets.forEach((subnet) =>
                subnet.createRoute(
                    `default-gw`,
                    {
                        destinationCidrBlock: '0.0.0.0/0',
                        networkInterfaceId: args.interfaceId,
                    },
                    { parent: this },
                ),
            ),
        )

        pulumi
            .all([
                args.vpc.privateSubnets,
                args.vpc.publicSubnets,
                args.vpc.isolatedSubnets,
            ])
            .apply(([privateSubnets, publicSubnets, isolatedSubnets]) =>
                [
                    ...privateSubnets,
                    ...publicSubnets,
                    ...isolatedSubnets,
                ].forEach((subnet) =>
                    [
                        '192.168.0.0/18',
                        '192.168.128.0/18',
                        '192.168.192.0/18',
                        //'13.238.72.35/32', // jumpbox.cue-sandbox.swm.com.au
                        //'54.252.158.21/32', // bastion.swmdigital.io
                        //'52.63.148.231/32', // perthnow bastion
                        //'13.55.57.151/32', // branch-deploys bastion
                        //'54.79.218.38/32', // thewest bastion
                        //'3.104.86.9/32', // sevennews bastion
                    ].forEach((destinationCidrBlock, idx) =>
                        subnet.createRoute(
                            `home-${idx}`,
                            {
                                destinationCidrBlock,
                                networkInterfaceId: args.interfaceId,
                            },
                            { parent: this },
                        ),
                    ),
                ),
            )
    }
}
