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
