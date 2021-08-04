import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from './helpers'

export const homeIPv6s = [
    '2404:bf40:e402::/48', // gabo rd
]

export const trustedPublicIPv6s = homeIPv6s // TODO add the VPC cidr to this

export const trustedPublicIPv4s = [
    '210.10.212.154/32', // gabo rd
    '202.41.193.62/32', // herdsman pde
]

export const homeIPv4s = [
    '192.168.0.0/18',
    //192.168.64.0/18 is assigned to the aws VPC
    '192.168.128.0/18',
    '192.168.192.0/18',
]

export const vpcIPv4s = ['192.168.64.0/18']

export const privateIPv4s = [...vpcIPv4s, ...homeIPv4s]
export const trustedPrivateIPv4s = [...homeIPv4s]

export class SecurityGroups extends pulumi.ComponentResource {
    /**
     * A permissive outbound security group that allows all outbound access
     */
    allowEgressToAllSecurityGroup: aws.ec2.SecurityGroup

    /** Allow SSH from trusted sources */
    allowSshFromTrustedSources: aws.ec2.SecurityGroup

    /**
     * A semi-permissive inbound security group that allows inbound access
     * from within the VPC
     */
    allowInboundWithinVpc: aws.ec2.SecurityGroup

    /**
     * A semi-permissive inbound security group that allows inbound access
     * from the VPC and private subnets
     */
    allowInboundFromPrivate: aws.ec2.SecurityGroup

    /** A security group for the gateway, includes routes n stuff */
    gatewaySecurityGroup: aws.ec2.SecurityGroup

    /**
     * A security group which permits essential ICMP and ICMPv6 messages
     * (such as Packet Too Large)
     */
    essentialIcmpSecurityGroup: aws.ec2.SecurityGroup

    /**
     * A security group that allows access from home subnets.
     */
    allowInboundFromHome: aws.ec2.SecurityGroup

    /**
     * @param name {string}
     * @param args {object}
     * @param opts {pulumi.ComponentResourceOptions}
     */
    constructor(
        name: string,
        args: {
            /** The VPC Id in which the security groups will be created */
            vpcId: pulumi.Input<string>
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:security-groups/SecurityGroups', name, args, opts)

        const vpc = pulumi
            .output(args.vpcId)
            .apply((id) => aws.ec2.getVpc({ id }, { parent: this }))

        /**
         * Allow outbound TCP and UDP to all IP addresses. Use this
         * everywhere that needs to connect to arbitrary sites.
         */
        this.allowEgressToAllSecurityGroup = new aws.ec2.SecurityGroup(
            `${name}-sg-egress-allow-all`,
            {
                description:
                    'A permissive security group that allows all' +
                    ' outbound access',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                egress: [
                    {
                        fromPort: 0,
                        toPort: 65535,
                        description: 'Allow all outbound destinations',
                        protocol: 'tcp',
                        ipv6CidrBlocks: ['::/0'],
                    },
                    {
                        fromPort: 0,
                        toPort: 65535,
                        description: 'Allow all outbound destinations',
                        protocol: 'udp',
                        ipv6CidrBlocks: ['::/0'],
                    },
                    {
                        fromPort: 0,
                        toPort: 65535,
                        description: 'Allow all outbound destinations',
                        protocol: 'tcp',
                        cidrBlocks: ['0.0.0.0/0'],
                    },
                    {
                        fromPort: 0,
                        toPort: 65535,
                        description: 'Allow all outbound destinations',
                        protocol: 'udp',
                        cidrBlocks: ['0.0.0.0/0'],
                    },
                ],
                tags: getTags({ Name: `${name}-sg-egress-allow-all` }),
            },
            { parent: this },
        )

        /**
         * Permit essential ICMP and ICMPv6. Use this everywhere.
         */
        this.essentialIcmpSecurityGroup = new aws.ec2.SecurityGroup(
            `${name}-sg-essential-icmp`,
            {
                description:
                    'A permissive security group that allows all ' +
                    'outbound access, and important ICMP/ICMPv6',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        protocol: 'icmpv6',
                        fromPort: 128, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description: 'allow icmpv6 echo request',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 129, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description: 'allow icmpv6 echo reply',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 2, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description:
                            'allow icmpv6 packet too big (essential in IPv6)',
                        ipv6CidrBlocks: ['::/0'],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 3, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description:
                            'allow icmpv6 time exceeded (used by traceroute)',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 8, // icmp type
                        toPort: 0, // icmp code
                        description: 'allow icmp echo request',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 0, // icmp type
                        toPort: 0, // icmp code
                        description: 'allow icmp echo reply',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 3, // icmp type
                        toPort: 4, // icmp code
                        description:
                            'allow icmp fragmentation needed (very important)',
                        cidrBlocks: ['0.0.0.0/0'],
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 11, // icmp type
                        toPort: 0, // icmp code
                        description:
                            'allow icmp time exceeded (used by traceroute)',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                ],
                egress: [
                    {
                        protocol: 'icmpv6',
                        fromPort: 128, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description: 'allow icmpv6 echo request',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 129, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description: 'allow icmpv6 echo reply',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 2, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description:
                            'allow icmpv6 packet too big (essential in IPv6)',
                        ipv6CidrBlocks: ['::/0'],
                    },
                    {
                        protocol: 'icmpv6',
                        fromPort: 3, // icmpv6 type
                        toPort: 0, // icmpv6 code
                        description:
                            'allow icmpv6 time exceeded (used by traceroute)',
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 8, // icmp type
                        toPort: 0, // icmp code
                        description: 'allow icmp echo request',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 0, // icmp type
                        toPort: 0, // icmp code
                        description: 'allow icmp echo reply',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 3, // icmp type
                        toPort: 4, // icmp code
                        description:
                            'allow icmp fragmentation needed (very important)',
                        cidrBlocks: ['0.0.0.0/0'],
                    },
                    {
                        protocol: 'icmp',
                        fromPort: 11, // icmp type
                        toPort: 0, // icmp code
                        description:
                            'allow icmp time exceeded (used by traceroute)',
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                    },
                ],
                tags: getTags({ Name: `${name}-sg-essential-icmp` }),
            },
            { parent: this },
        )

        this.allowInboundWithinVpc = new aws.ec2.SecurityGroup(
            `${name}-inbound-within-vpc`,
            {
                description: 'allow all traffic from within the VPC',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                        description: 'allow all inbound within the VPC',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                        description: 'allow all inbound within the VPC',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                ],
                tags: getTags({ Name: `${name}-inbound-within-vpc` }),
            },
            { parent: this },
        )

        this.gatewaySecurityGroup = new aws.ec2.SecurityGroup(
            `${name}-gw`,
            {
                description: 'security group for gateway',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: trustedPublicIPv6s,
                        description: 'allow inbound SSH from trusted sources',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        cidrBlocks: trustedPublicIPv4s,
                        description: 'allow inbound SSH from trusted sources',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                        description: 'allow incoming routed traffic',
                    },
                    {
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                        description: 'allow incoming routed traffic',
                    },
                ],
                egress: [
                    {
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                        description: 'allow outgoing SSH to VPC',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                        description: 'allow outgoing SSH to VPC',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                        description: 'allow outgoing routed traffic',
                    },
                    {
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                        description: 'allow outgoing routed traffic',
                    },
                    {
                        protocol: '-1',
                        ipv6CidrBlocks: ['::/0'],
                        description: 'allow outbound',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        protocol: '-1',
                        cidrBlocks: ['0.0.0.0/0'],
                        description: 'allow outbound',
                        fromPort: 0,
                        toPort: 0,
                    },
                ],
                tags: getTags({ Name: `${name}-gw` }),
            },
            { parent: this },
        )

        this.allowSshFromTrustedSources = new aws.ec2.SecurityGroup(
            `${name}-allow-ssh-from-trusted`,
            {
                description: 'allow SSH from trusted sources',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        fromPort: 22,
                        toPort: 22,
                        protocol: 'tcp',
                        securityGroups: [this.gatewaySecurityGroup.id],
                    },
                    {
                        fromPort: 22,
                        toPort: 22,
                        protocol: 'tcp',
                        ipv6CidrBlocks: trustedPublicIPv6s,
                    },
                    {
                        fromPort: 22,
                        toPort: 22,
                        protocol: 'tcp',
                        cidrBlocks: trustedPrivateIPv4s,
                    },
                ],
            },
            { parent: this },
        )

        this.allowInboundFromPrivate = new aws.ec2.SecurityGroup(
            `${name}-inbound-from-private`,
            {
                description: 'allow all traffic from private subnets',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: [vpc.ipv6CidrBlock],
                        description: 'allow all traffic from within the VPC',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        ipv6CidrBlocks: trustedPublicIPv6s,
                        description: 'allow all traffic from trusted sources',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        cidrBlocks: pulumi
                            .output(vpc.cidrBlockAssociations)
                            .apply((ass) =>
                                ass.map((block) => block.cidrBlock),
                            ),
                        description: 'allow all traffic from within the VPC',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        description: 'allow traffic from home subnets',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        cidrBlocks: trustedPublicIPv4s,
                        description: 'allow all traffic from trusted sources',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                ],
                tags: getTags({ Name: `${name}-inbound-from-private` }),
            },
            { parent: this },
        )

        this.allowInboundFromHome = new aws.ec2.SecurityGroup(
            `${name}-inbound-from-home`,
            {
                description: 'allow all traffic from private subnets',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        description: 'allow all traffic from home',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        description: 'allow traffic from home',
                        protocol: '-1',
                        fromPort: 0,
                        toPort: 0,
                    },
                ],
                tags: getTags({ Name: `${name}-inbound-from-home` }),
            },
            { parent: this },
        )
    }
}
