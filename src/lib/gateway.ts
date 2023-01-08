import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { Netmask } from 'netmask'
import { Instance, InstanceArgs, userData as defaultUserData } from './instance'
import {
    getSsmAgentUrl,
    instancePolicies as ssmAgentPolicies,
} from './ssm-agent'

const config = new pulumi.Config('gateway')

export interface GatewayArgs extends Partial<InstanceArgs> {
    /**
     * The underlying instance will be added to subnets with these IDs
     */
    subnetIds: pulumi.Input<string[]>

    /**
     * The gateway will be added to the VPC with this ID
     */
    vpcId: pulumi.Input<string>

    /**
     * Security groups with these IDs will be applied to the gateway interface
     */
    securityGroupIds: pulumi.Input<string>[]

    /**
     * DNS settings for the gateway
     */
    dns: {
        /**
         * Create DNS records (A and AAAA) for the instance in this Route53
         * hosted zone
         */
        zone: pulumi.Input<string>

        /**
         * The hostname for the DNS records. Can be relative to the parent
         * zone, or fully-qualified.
         *
         * For example, if the parent zone is example.com, then the following
         * hostnames will produce the same records:
         *   - myhost.example.com
         *   - myhost
         */
        hostname: pulumi.Input<string>
    }

    /**
     * These CIDRs will be DNAT'ed by the gateway.
     */
    natCidrs?: pulumi.Input<string>[]

    /**
     * OpenVPN settings for the gateway
     */
    openvpn: {
        /**
         * Tunnel addresses (remote and local). This corresponds to the
         * ifconfig entry in the openvpn config file.
         */
        tunnel: {
            /**
             * The IP address within the tunnel of the gateway. This
             * corresponds to the first address in the ifconfig entry in the
             * openvpn config file.
             */
            localAddress: pulumi.Input<string>

            /**
             * The IP address within the tunnel of the remote endpoint. This
             * corresponds to the second address in the ifconfig entry in the
             * openvpn config file.
             */
            remoteAddress: pulumi.Input<string>
        }

        /**
         * The port for openvpn to listen on. Default: 1194
         */
        listenOnPort?: pulumi.Input<number | undefined>

        /**
         * The public address of the remote openvpn server. Corresponds to the
         * remote entry in the openvpn config file.
         */
        remote: {
            /**
             * The IP address or hostname of the remote server.
             */
            address: pulumi.Input<string>

            /**
             * The port of the remote server. Default: 1194
             */
            port?: pulumi.Input<number | undefined>
        }

        /**
         * A list of CIDRs that should be routed over the VPN tunnel.
         */
        routedCidrs?: pulumi.Input<string>[]
    }

    /**
     * An SNS topic for sending notifications
     */
    notificationsTopicArn: pulumi.Input<string>

    /**
     * The patch group for the instance
     */
    patchGroup?: pulumi.Input<string>
}

/**
 * Gateway provides two things:
 *  - an SSH target to connect to remotely
 *  - an OpenVPN server that connects back to the unifi router at home
 *  - a NAT gateway for the private subnets
 */
export class Gateway extends pulumi.ComponentResource {
    /**
     * The public IP address of the gateway instance.
     */
    ip: pulumi.Output<string>

    /**
     * The public IP address of the gateway instance.
     */
    publicIp: pulumi.Output<string>

    /**
     * The private IP address of the gateway instance.
     */
    privateIp: pulumi.Output<string>

    /**
     * The IPv6 address of the gateway instance.
     */
    ipv6: pulumi.Output<string>

    /**
     * The hostname of the gateway instance
     */
    hostname: pulumi.Output<string>

    /**
     * The instance ID of the gateway instance
     */
    instanceId: pulumi.Output<string>

    /**
     * The ID of the network interface attached to the gatway instance
     */
    interfaceId: pulumi.Output<string>

    /**
     * The pulumi urn of the gateway instance
     */
    instanceUrn: pulumi.Output<string>

    constructor(
        name: string,
        args: GatewayArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:gateway/Gateway', name, args, opts)

        // TODO add this to wireguard config
        const routes = pulumi.output(args.openvpn.routedCidrs).apply((cidrs) =>
            (cidrs ?? []).map((cidr) => {
                const subnet = new Netmask(cidr)
                return `route ${subnet.base} ${subnet.mask}`
            }),
        )

        const wireguard = {
            publickey: config.requireSecret('wireguard-publickey'),
            privatekey: config.requireSecret('wireguard-privatekey'),
            presharedkey: config.requireSecret('wireguard-presharedkey'),
            peerkey: config.requireSecret('wireguard-peerkey'),
        }
        const wireguardConf = pulumi
            .all([
                wireguard.peerkey,
                wireguard.privatekey,
                wireguard.presharedkey,
            ])
            .apply(([peerkey, privatekey, presharedkey]) =>
                `   [Interface]
                    #Address = fe80::1/64, 192.168.127.1/24
                    Address = 192.168.127.1/24
                    PrivateKey = ${privatekey}
                    ListenPort = 37081

                    [Peer]
                    PublicKey = ${peerkey}
                    PresharedKey = ${presharedkey}
                    Endpoint = udm-ext.home.bennettp123.com:37081
                    #AllowedIps = 2406:da1c:a70:9300::/56, fe80::1/128, 192.168.127.2/32, 192.168.0.0/18, 192.168.128.0/18, 192.168.192.0/18
                    AllowedIps = 192.168.127.2/32, 192.168.0.0/18, 192.168.128.0/18, 192.168.192.0/18
                    PersistentKeepalive = 3
                `
                    .split('\n')
                    .map((line) => line.replace(/^\s*/, ''))
                    .join('\n'),
            )

        /**
         * https://www.wireguard.com/compilation/
         * The AMI includes kernel 5.10 preinstalled, so there's no need to build the
         * kernel modules. However, EPEL7 doesn't provide wireguard-tools for arm64,
         * and I couldn't find prebuilt binaries anywhere, so... let's just compile it.
         */
        const installWireguardTools = `
            #!/bin/sh
            cd "$(mktemp -d)"
            git clone https://git.zx2c4.com/wireguard-tools wireguard-tools
            make -C wireguard-tools/src -j"$(nproc)"
            sudo make -C wireguard-tools/src install
            RESULT=$?
            rm -rf "$(pwd)"
            exit $RESULT
        `
            .split('\n')
            .map((line) => line.replace(/^\s*/, ''))
            .join('\n')

        // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-linux-ami-basics.html#amazon-linux-image-id
        const enableKernelLivePatching = `
            #!/bin/sh
            sudo yum update -t -y kpatch-runtime
            sudo yum kernel-livepatch -t -y enable
            sudo systemctl enable kpatch.service
            sudo amazon-linux-extras enable livepatch
        `
            .split('\n')
            .map((line) => line.replace(/^\s*/, ''))
            .join('\n')

        const tailscaleRoutedHostnames = ['bitbucket.swmdigital.io']

        // TODO look up hostnames (above)
        const tailscaleRoutes = [
            '54.252.158.21/32', // bastion.swmdigital.io
            '13.55.57.151/32', // branch-deploys
            '54.79.218.38/32', // thewest
            '52.63.148.231/32', // perthnow
            '3.104.86.9/32', // sevennews
            '13.210.30.53/32', // bitbucket.swmdigital.io
            '52.62.161.35/32', // bitbucket.swmdigital.io
        ]

        const tailscaleAuthkeyFile = '/root/.tailscaleAuthkey'
        const tailscaleAuthkey = config.requireSecret('tailscale-auth-key')

        // TODO advertise routes (above)
        // TODO advertise tags
        // TODO add token/key
        const startTailscaled = `
            #!/bin/sh
            sudo systemctl enable --now tailscaled
            sudo tailscale up \
              --advertise-routes="${tailscaleRoutes.join(',')}" \
              --advertise-tags="tag:server" \
              --auth-key="file:${tailscaleAuthkeyFile}"
        `
            .split('\n')
            .map((line) => line.replace(/^\s*/, ''))
            .join('\n')

        const userData = pulumi
            .all([
                args.natCidrs,
                wireguard.publickey,
                wireguard.privatekey,
                wireguard.presharedkey,
                wireguardConf,
                tailscaleAuthkey,
            ])
            .apply(
                ([
                    natCidrs,
                    publickey,
                    privatekey,
                    presharedkey,
                    wireguardConf,
                    tailscaleAuthkey,
                ]) => ({
                    ...defaultUserData,
                    yum_repos: {
                        ...defaultUserData.yum_repos,
                        'tailscale-stable': {
                            name: 'Tailscale stable',
                            baseurl:
                                'https://pkgs.tailscale.com/stable/amazon-linux/2/$basearch',
                            enabled: true,
                            type: 'rpm',
                            repo_gpgcheck: true,
                            gpgcheck: 0,
                            gpgkey: 'https://pkgs.tailscale.com/stable/amazon-linux/2/repo.gpg',
                        },
                    },
                    packages: [
                        ...defaultUserData.packages,

                        // these are used for kernel live patching
                        //'binutils',
                        //'yum-plugin-kernel-livepatch',
                        //'kpatch-runtime',

                        // this is for wireguard-tools -- most of
                        // '@Development Tools' is unnecessary.
                        'make',
                        'gcc',
                        'git',

                        'yum-utils',
                        'tailscale',

                        getSsmAgentUrl({ arch: 'arm64' }),
                        'python3', // required by patch manager
                    ],
                    write_files: [
                        ...defaultUserData.write_files,
                        {
                            path: '/etc/wireguard/publickey',
                            owner: 'root:root',
                            permissions: '0600',
                            content: publickey,
                        },
                        {
                            path: '/etc/wireguard/privatekey',
                            owner: 'root:root',
                            permissions: '0600',
                            content: privatekey,
                        },
                        {
                            path: '/etc/wireguard/presharedkey',
                            owner: 'root:root',
                            permissions: '0600',
                            content: presharedkey,
                        },
                        {
                            path: tailscaleAuthkeyFile,
                            owner: 'root:root',
                            permissions: '0600',
                            content: tailscaleAuthkey,
                        },
                        {
                            path: '/etc/wireguard/wg0.conf',
                            owner: 'root:root',
                            permissions: '0600',
                            content: wireguardConf,
                        },
                        {
                            path: '/opt/bennettp123/bin/install-wireguard-tools',
                            owner: 'root:root',
                            permissions: '0755',
                            content: installWireguardTools,
                        },
                        {
                            path: '/opt/bennettp123/bin/enable-kernel-live-patching',
                            owner: 'root:root',
                            permissions: '0755',
                            content: enableKernelLivePatching,
                        },
                        {
                            path: '/opt/bennettp123/bin/set-up-talescale',
                            owner: 'root:root',
                            permissions: '0755',
                            content: startTailscaled,
                        },
                    ],
                    bootcmd: [
                        'set +x',
                        'exec >/tmp/bootcmd-logs 2>&1',
                        'echo 1 > /proc/sys/net/ipv4/ip_forward',
                        'echo 1 > /proc/sys/net/ipv4/conf/eth0/proxy_arp',
                        'echo 1 > /proc/sys/net/ipv6/all/forwarding',
                        ...(natCidrs ?? []).map(
                            (cidr) =>
                                `iptables -t nat -A POSTROUTING -o eth0 -s ${cidr} -j MASQUERADE`,
                        ),
                        'systemctl start "wg-quick@wg0.service"',
                    ],
                    runcmd: [
                        'set +x',
                        'exec > /tmp/runcmd-logs 2>&1',
                        ...defaultUserData.runcmd,

                        'mkdir -p /etc/sysconfig/network-scripts',

                        // By default, forwarding isn't enabled. Enable it
                        // globally, and explicityly enable accept_ra too.
                        'echo "IPV6FORWARDING=yes" >> /etc/sysconfig/network',
                        'echo "IPV6_AUTOCONF=yes" >> /etc/sysconfig/network',

                        // Enable forwarding and accept_ra for eth0 and wg0
                        'echo "IPV6FORWARDING=yes" >> /etc/sysconfig/network-scripts/ifcfg-eth0',
                        'echo "IPV6_ROUTER=yes" >> /etc/sysconfig/network-scripts/ifcfg-eth0',
                        'echo "IPV6_AUTOCONF=yes" >> /etc/sysconfig/network-scripts/ifcfg-eth0',
                        'echo "IPV6FORWARDING=yes" >> /etc/sysconfig/network-scripts/ifcfg-wg0',

                        // restart networking to apply the settings above
                        // (not sure if this is needed)
                        '/sbin/service network restart',
                        'ifdown eth0',
                        'ifup eth0',

                        // install and enable tailscale
                        '/opt/bennettp123/bin/set-up-talescale',

                        // install and enable wireguard
                        '/opt/bennettp123/bin/install-wireguard-tools',
                        'systemctl enable "wg-quick@wg0.service"',
                        'systemctl start "wg-quick@wg0.service"',
                        'ping -c1 192.168.127.2',

                        // enable kernel live patching
                        '/opt/bennettp123/bin/enable-kernel-live-patching',
                    ],
                }),
            )

        const role = new aws.iam.Role(
            `${name}-instance`,
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(
                    aws.iam.Principals.Ec2Principal,
                ),
            },
            { parent: this },
        )

        ssmAgentPolicies.forEach(
            (policyArn, index) =>
                new aws.iam.RolePolicyAttachment(
                    `${name}-instance-${index}`,
                    {
                        role: role.name,
                        policyArn,
                    },
                    { parent: this },
                ),
        )

        const instance = new Instance(
            name,
            {
                subnetIds: args.subnetIds,
                instanceType: 't4g.nano', // the smollest possible instance type
                vpcId: args.vpcId,
                securityGroupIds: args.securityGroupIds,
                userData,
                network: {
                    fixedPrivateIp: true,
                    useEIP: true,
                    fixedIpv6: true,
                    useENI: true,
                    sourceDestCheck: false,
                },
                dns: args.dns,
                notificationsTopicArn: args.notificationsTopicArn,
                offline: false,
                instanceRoleId: role.id,
                patchGroup: args.patchGroup,
                swapGigs: 1,
            },
            { parent: this },
        )

        this.ip =
            instance.ip ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.ip is undefined',
                    this,
                )
            })()

        this.ipv6 =
            instance.ipv6 ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.ipv6 is undefined',
                    this,
                )
            })()

        this.hostname = pulumi.output(instance.hostname).apply(
            (hostname) =>
                hostname ??
                (() => {
                    throw new pulumi.ResourceError(
                        'internal error: gateway instance.hostname is undefined',
                        this,
                    )
                })(),
        )

        this.instanceId =
            instance.instanceId ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.instanceId is undefined',
                    this,
                )
            })()

        this.interfaceId =
            instance.interfaceId ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.interfaceId is undefined',
                    this,
                )
            })()

        this.publicIp =
            instance.publicIp ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.publicIp is undefined',
                    this,
                )
            })()

        this.privateIp =
            instance.privateIp ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.privateIp is undefined',
                    this,
                )
            })()

        this.instanceUrn =
            instance.instanceUrn ??
            (() => {
                throw new pulumi.ResourceError(
                    'internal error: gateway instance.instanceUrn is undefined',
                    this,
                )
            })()
    }
}
