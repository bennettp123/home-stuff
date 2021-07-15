import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import * as pulumi from '@pulumi/pulumi'

export interface NetworkingArgs {
    numberOfAvailabilityZones?: number
    numberOfNatGateways?: number
    enableIPv6?: boolean
    cidrBlock?: string
}

export class Vpc extends pulumi.ComponentResource {
    dbSubnetIds: pulumi.Output<string[]>
    privateSubnetIds: pulumi.Output<string[]>
    publicSubnetIds: pulumi.Output<string[]>
    vpcArn: pulumi.Output<string>
    vpcId: pulumi.Output<string>
    natGatewayPublicCidrs: pulumi.Output<pulumi.Output<string>[]>
    ipv6PublicCidrs: pulumi.Output<string>[]
    privateAZs: pulumi.Output<string[]>
    publicAZs: pulumi.Output<string[]>
    isolatedAZs: pulumi.Output<string[]>

    constructor(
        name: string,
        {
            cidrBlock = '10.0.0.0/16',
            enableIPv6 = true,
            numberOfAvailabilityZones = 3,
            numberOfNatGateways = 3,
        }: NetworkingArgs,
        opts?: pulumi.ComponentResourceOptions | undefined,
    ) {
        super('bennettp123:vpc/Vpc', name, {}, opts)

        const newsMonoVpcName = `${name}-vpc`
        const newsMonoVpc = new awsx.ec2.Vpc(
            newsMonoVpcName,
            {
                numberOfAvailabilityZones,
                numberOfNatGateways,
                cidrBlock,
                enableDnsSupport: true,
                enableDnsHostnames: true,
                assignGeneratedIpv6CidrBlock: enableIPv6,
                subnets: [
                    {
                        type: 'private',
                        cidrMask: 24,
                    },
                    {
                        type: 'isolated',
                        cidrMask: 24,
                    },
                    {
                        type: 'public',
                        cidrMask: 24,
                    },
                ],
            },
            { parent: this },
        )
        this.vpcArn = newsMonoVpc.vpc.arn
        this.vpcId = newsMonoVpc.vpc.id

        this.dbSubnetIds = pulumi
            .output(newsMonoVpc.isolatedSubnets)
            .apply((subnets) => subnets.map((subnet) => subnet.id))
            .apply((subnets) => {
                if (subnets.length === 0) {
                    throw new Error(`Cant find ${name}-db subnet`)
                }
                return pulumi.all(subnets)
            })

        this.privateSubnetIds = pulumi
            .output(newsMonoVpc.privateSubnets)
            .apply((subnets) => subnets.map((subnet) => subnet.id))
            .apply((subnets) => {
                if (subnets.length === 0) {
                    throw new Error(`Cant find ${name}-private subnet`)
                }
                return pulumi.all(subnets)
            })

        this.publicSubnetIds = pulumi
            .output(newsMonoVpc.publicSubnets)
            .apply((subnets) => subnets.map((subnet) => subnet.id))
            .apply((subnets) => {
                if (subnets.length === 0) {
                    throw new Error(`Cant find ${name}-public subnet`)
                }
                return pulumi.all(subnets)
            })

        /**
         * A list of public IPv6 CIDRs associated with this VPC
         */
        this.ipv6PublicCidrs = [
            pulumi.output(newsMonoVpc.vpc).apply((vpc) => vpc.ipv6CidrBlock),
        ]

        /**
         * A list of all NAT gateways, as provided by the underlying module,
         * in CIDR format
         */
        this.natGatewayPublicCidrs = pulumi
            .output(newsMonoVpc.natGateways)
            .apply((gateways) =>
                gateways.map(
                    // use the elastic IP (if assigned), otherwise use the public IP
                    (gw) => gw.elasticIP?.publicIp || gw.natGateway.publicIp,
                ),
            )
            .apply((ips) =>
                ips.map((ip) =>
                    pulumi
                        .output(ip)
                        // convert to CIDR format
                        .apply((ip) => (ip.match(/\/\d+/) ? ip : `${ip}/32`)),
                ),
            )

        const egressOnlyGatewayName = `${name}-egress-only-gateway`
        /**
         * An egress-only gateway is like a NAT gateway, but for IPv6 only.
         * Also, IPv6 doesn't need NAT, so it has no public IPs of its own.
         */
        const egressOnlyGateway = new aws.ec2.EgressOnlyInternetGateway(
            egressOnlyGatewayName,
            {
                vpcId: this.vpcId,
            },
            { parent: this },
        )

        // create default IPv6 routes in private subnets
        pulumi.output(newsMonoVpc.privateSubnets).apply((subnets) =>
            subnets.map((subnet) =>
                subnet.createRoute('default-ipv6-out', {
                    destinationIpv6CidrBlock: '::/0',
                    egressOnlyGatewayId: egressOnlyGateway.id,
                }),
            ),
        )

        const igw = newsMonoVpc.internetGateway

        /**
         * create default IPv6 routes in public subnets
         */
        pulumi.output(newsMonoVpc.publicSubnets).apply((subnets) =>
            subnets.map((subnet) =>
                subnet.createRoute('default-ipv6-out', {
                    destinationIpv6CidrBlock: '::/0',
                    gatewayId: pulumi.output(igw).apply(
                        (igw) =>
                            igw?.internetGateway.id ||
                            (() => {
                                throw new pulumi.ResourceError(
                                    'Unable to determine inetnet gateway id',
                                    this,
                                )
                            })(),
                    ),
                }),
            ),
        )

        this.privateAZs = pulumi
            .output(newsMonoVpc.privateSubnets)
            .apply((subnets) => subnets.map((s) => s.subnet.availabilityZone))
            .apply((azs) => {
                if (azs.length === 0) {
                    throw new Error(`Cant find ${name} availability zones`)
                }
                return pulumi.all(azs)
            })

        this.publicAZs = pulumi
            .output(newsMonoVpc.publicSubnets)
            .apply((subnets) => subnets.map((s) => s.subnet.availabilityZone))
            .apply((azs) => {
                if (azs.length === 0) {
                    throw new Error(`Cant find ${name} availability zones`)
                }
                return pulumi.all(azs)
            })

        this.isolatedAZs = pulumi
            .output(newsMonoVpc.isolatedSubnets)
            .apply((subnets) => subnets.map((s) => s.subnet.availabilityZone))
            .apply((azs) => {
                if (azs.length === 0) {
                    throw new Error(`Cant find ${name} availability zones`)
                }
                return pulumi.all(azs)
            })

        this.registerOutputs({
            dbSubnetIds: this.dbSubnetIds,
            privateSubnetIds: this.privateSubnetIds,
            publicSubnetIds: this.publicSubnetIds,
            vpcArn: this.vpcArn,
            vpcId: this.vpcId,
            natGatewayPublicCidrs: this.natGatewayPublicCidrs,
            ipv6PublicCidrs: this.ipv6PublicCidrs,
            privateAZs: this.privateAZs,
            publicAZs: this.publicAZs,
            isolatedAZs: this.isolatedAZs,
        })
    }
}