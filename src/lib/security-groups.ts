import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as ipAddress from 'ip-address'
import { getTags } from '../helpers'

export const homeIPv6s = [
    '2404:bf40:e402::/48', // gabo rd LAN
    '2001:c78:1300:1a::2/128', // gabo rd WAN
]

export const trustedPublicIPv6s = homeIPv6s // TODO add the VPC cidr to this

export const allowSshFromIpv6 = [
    '2001:8000::/20', // telstra IPv6, because I'm lazy AF
    ...trustedPublicIPv6s,
    // extra IPv6 addresses go here
]

export const homePublicIPv4s = [
    '210.10.212.154/32', // gabo rd
]

export const workPublicIPv4s = [
    '202.41.193.62/32', // herdsman pde
]

/**
 * Outbound SSH is permitted from the gateway to these IPv6 CIDRs
 */
export const gatewayExtraOutboundSshIPv6s = [
    '2406:da1c:358:b800::/56', // news-shared-thewest-networking-vpc
    '2406:da1c:fa5:5000::/56', // news-shared-perthnow-networking-vpc
    '2406:da1c:8a3:5c00::/56', // news-shared-sevennews-networking-vpc
    '2406:da1c:6ab:ec00::/56', // news-shared-branch-deploys-networking-vpc
    '2406:da1c:af6:fa00::/56', // ssapi-shared-prd-vpc
    '2406:da1c:44a:1a00::/56', // ssw-shared-dev-vpc
    '2406:da1c:22:d300::/56', // ssapi-shared-dev-vpc
    '2406:da1c:50d:a200::/56', // ssw-shared-prd-vpc
]

/**
 * Outbound SSH is permitted from the gateway to these IPv4 CIDRs
 */
export const gatewayExtraOutboundSshIPv4s = [
    '54.252.158.21/32', // bastion.swmdigital.io
    '54.79.218.38/32', // the-west-prod jumpbox
    '52.63.148.231/32', // perthnow-prod jumpbox
    '3.104.86.9/32', // sevennews-prod jumpbox
    '13.55.57.151/32', // branch-deploys jumpbox
]

export const trustedPublicIPv4s = [...homePublicIPv4s, ...workPublicIPv4s]

export const allowSshFromIpv4 = [
    ...trustedPublicIPv4s,
    // extra IPv4 addresses go here
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

// everything except 192.168.0.0/16
export const notPrivateIPv4s = [
    '0.0.0.0/1',
    '128.0.0.0/2',
    '224.0.0.0/3',
    '208.0.0.0/4',
    '200.0.0.0/5',
    '196.0.0.0/6',
    '194.0.0.0/7',
    '193.0.0.0/8',
]

// everything except homeIPv6s and the vpc
// assumes the VPC is 2406:da1c:a70:9300::/56
// assumes home is 2404:bf40:e402::/48
export const notPrivateIPv6s = [
    '8000::/1',
    '4000::/2',
    '3000::/4',
    '2000::/6',
    '2400::/14',
    '2404::/17',
    '2404:8000::/19',
    '2404:a000::/20',
    '2404:b000::/21',
    '2404:b800::/22',
    '2404:bc00::/23',
    '2404:be00::/24',
    '2404:bf00::/26',
    /*
    '2404:bf40::/33',
    '2404:bf40:8000::/34',
    '2404:bf40:c000::/35',
    '2404:bf40:e000::/38',
    '2404:bf40:e400::/47',
    '2404:bf40:e403::/48',
    '2404:bf40:e404::/46',
    '2404:bf40:e408::/45',
    '2404:bf40:e410::/44',
    '2404:bf40:e420::/43',
    '2404:bf40:e440::/42',
    '2404:bf40:e480::/41',
    '2404:bf40:e500::/40',
    '2404:bf40:e600::/39',
    '2404:bf40:e800::/37',
    '2404:bf40:f000::/36',
    */
    '2404:bf41::/32',
    '2404:bf42::/31',
    '2404:bf44::/30',
    '2404:bf48::/29',
    '2404:bf50::/28',
    '2404:bf60::/27',
    '2404:bf80::/25',
    '2404:c000::/18',
    '2405::/16',
    '2406::/17',
    '2406:8000::/18',
    '2406:c000::/20',
    '2406:d000::/21',
    '2406:d800::/23',
    '2406:da00::/28',
    '2406:da10::/29',
    '2406:da18::/30',
    /*
    '2406:da1c::/37',
    '2406:da1c:0800::/39',
    '2406:da1c:0a00::/42',
    '2406:da1c:0a40::/43',
    '2406:da1c:0a60::/44',
    '2406:da1c:0a70::/49',
    '2406:da1c:0a70:8000::/52',
    '2406:da1c:0a70:9000::/55',
    '2406:da1c:0a70:9200::/56',
    '2406:da1c:0a70:9400::/54',
    '2406:da1c:0a70:9800::/53',
    '2406:da1c:0a70:a000::/51',
    '2406:da1c:0a70:c000::/50',
    '2406:da1c:0a71::/48',
    '2406:da1c:0a72::/47',
    '2406:da1c:0a74::/46',
    '2406:da1c:0a78::/45',
    '2406:da1c:0a80::/41',
    '2406:da1c:0b00::/40',
    '2406:da1c:0c00::/38',
    '2406:da1c:1000::/36',
    '2406:da1c:2000::/35',
    '2406:da1c:4000::/34',
    '2406:da1c:8000::/33',
    */
    '2406:da1d::/32',
    '2406:da1e::/31',
    '2406:da20::/27',
    '2406:da40::/26',
    '2406:da80::/25',
    '2406:db00::/24',
    '2406:dc00::/22',
    '2406:e000::/19',
    '2407::/16',
    '2408::/13',
    '2410::/12',
    '2420::/11',
    '2440::/10',
    '2480::/9',
    '2500::/8',
    '2600::/7',
    '2800::/5',
]

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
     * A security group for the plex server, includes routes n stuff
     * https://support.plex.tv/articles/201543147-what-network-ports-do-i-need-to-allow-through-my-firewall/
     */
    plexSecurityGroup: aws.ec2.SecurityGroup

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

        const gatewayEgressSsh = {
            ipv6: [vpc.ipv6CidrBlock, ...gatewayExtraOutboundSshIPv6s],
            ipv4: pulumi
                .output(vpc.cidrBlockAssociations)
                .apply((ass) => ass.map((block) => block.cidrBlock))
                .apply((cidrs) => [...cidrs, ...gatewayExtraOutboundSshIPv4s]),
        }

        this.gatewaySecurityGroup = new aws.ec2.SecurityGroup(
            `${name}-gw`,
            {
                description: 'security group for gateway',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: allowSshFromIpv6,
                        description: 'allow inbound SSH from trusted sources',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        cidrBlocks: allowSshFromIpv4,
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
                        ipv6CidrBlocks: gatewayEgressSsh.ipv6,
                        description: 'allow outgoing SSH to permitted CIDRs',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        cidrBlocks: gatewayEgressSsh.ipv4,
                        description: 'allow outgoing SSH to permitted CIDRs',
                        protocol: 'tcp',
                        fromPort: 22,
                        toPort: 22,
                    },
                    {
                        ipv6CidrBlocks: gatewayExtraOutboundSshIPv6s,
                        description: 'allow SSH to bitbucket over tcp 7999',
                        protocol: 'tcp',
                        fromPort: 7999,
                        toPort: 7999,
                    },
                    {
                        cidrBlocks: gatewayExtraOutboundSshIPv4s,
                        description: 'allow SSH to bitbucket over tcp 7999',
                        protocol: 'tcp',
                        fromPort: 7999,
                        toPort: 7999,
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

        this.plexSecurityGroup = new aws.ec2.SecurityGroup(
            `${name}-plex`,
            {
                description: 'security group for plex media server',
                revokeRulesOnDelete: true,
                vpcId: vpc.id,
                ingress: [
                    {
                        ipv6CidrBlocks: ['::/0'],
                        fromPort: 32400,
                        toPort: 32400,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: ['::/0'],
                        fromPort: 32400,
                        toPort: 32400,
                        protocol: 'udp',
                    },
                    {
                        cidrBlocks: ['0.0.0.0/0'],
                        fromPort: 32400,
                        toPort: 32400,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: ['0.0.0.0/0'],
                        fromPort: 32400,
                        toPort: 32400,
                        protocol: 'udp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'udp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 8324,
                        toPort: 8324,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 32410,
                        toPort: 32410,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 32412,
                        toPort: 32414,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'udp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 8324,
                        toPort: 8324,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 32410,
                        toPort: 32410,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 32412,
                        toPort: 32414,
                        protocol: 'tcp',
                    },
                ],
                egress: [
                    {
                        ipv6CidrBlocks: notPrivateIPv6s,
                        fromPort: 0,
                        toPort: 0,
                        protocol: '-1',
                    },
                    {
                        cidrBlocks: notPrivateIPv4s,
                        fromPort: 0,
                        toPort: 0,
                        protocol: '-1',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 1900,
                        toPort: 1900,
                        protocol: 'udp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'udp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 8324,
                        toPort: 8324,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 32410,
                        toPort: 32410,
                        protocol: 'tcp',
                    },
                    {
                        ipv6CidrBlocks: homeIPv6s,
                        fromPort: 32412,
                        toPort: 32414,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 1900,
                        toPort: 1900,
                        protocol: 'udp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'udp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 5353,
                        toPort: 5353,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 8324,
                        toPort: 8324,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 32410,
                        toPort: 32410,
                        protocol: 'tcp',
                    },
                    {
                        cidrBlocks: homeIPv4s,
                        fromPort: 32412,
                        toPort: 32414,
                        protocol: 'tcp',
                    },
                ],
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
function isAddress(
    address: any,
): address is ipAddress.Address4 | ipAddress.Address6 {
    return (
        ((address as ipAddress.Address4).address !== undefined &&
            (address as ipAddress.Address4).startAddress !== undefined &&
            (address as ipAddress.Address4).endAddress !== undefined &&
            (address as ipAddress.Address4).bigInteger !== undefined) ||
        ((address as ipAddress.Address6).address !== undefined &&
            (address as ipAddress.Address6).startAddress !== undefined &&
            (address as ipAddress.Address6).endAddress !== undefined &&
            (address as ipAddress.Address6).bigInteger !== undefined)
    )
}

function isAddress4(address: any): address is ipAddress.Address4 {
    return isAddress(address) && (address as ipAddress.Address4).v4 === true
}

function isAddress6(address: any): address is ipAddress.Address6 {
    return isAddress(address) && (address as ipAddress.Address6).v4 === false
}

export function getSubnets<
    T extends ipAddress.Address4 | ipAddress.Address6,
>(args: { start: T; end: T }) {
    const start = args.start.startAddress()
    const end = args.end.endAddress()
    const addresses = []
    for (let i = start.bigInteger(); i < end.bigInteger() + 1; i++) {
        addresses.push(
            isAddress4(start)
                ? ipAddress.Address4.fromBigInteger(i)
                : isAddress6(start)
                ? ipAddress.Address6.fromBigInteger(i)
                : (() => {
                      throw new Error(
                          'start does not appear to be an Address4 or Address6 type',
                      )
                  })(),
        )
    }
    return addresses
}

export function packSubnets<T extends ipAddress.Address4 | ipAddress.Address6>(
    addresses: T[],
) {}

export function exclude<
    T extends ipAddress.Address4 | ipAddress.Address6,
>(args: { subnet: T; from: T }) {}
