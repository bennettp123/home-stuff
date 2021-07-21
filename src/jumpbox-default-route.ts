import * as awsx from '@pulumi/awsx'
import * as pulumi from '@pulumi/pulumi'

export class JumpBoxDefaultRoute extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            interfaceId: pulumi.Input<string>
            vpc: awsx.ec2.Vpc
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super(
            'bennettp123:jumpbox-default-route/JumpboxDefaultRoute',
            name,
            args,
            opts,
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
                    ].forEach((destinationCidrBlock, cnum) =>
                        subnet.createRoute(
                            `jumpbox-out-${cnum}`,
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
