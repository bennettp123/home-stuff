import * as pulumi from '@pulumi/pulumi'
import { Netmask } from 'netmask'
import { SshHostKeys } from './helpers'
import { packObject } from './helpers/pulumi-helpers'
import { Instance, InstanceArgs, userData as defaultUserData } from './instance'

const config = new pulumi.Config('gateway')

const sshHostKeys: pulumi.Output<SshHostKeys> = packObject<string | undefined>({
    ed25519: config.getSecret<string>('ssh-host-key-ed25519'),
    ed25519Pub: config.getSecret<string>('ssh-host-key-ed25519-pub'),
    ecdsa: config.getSecret<string>('ssh-host-key-ecdsa'),
    ecdsaPub: config.getSecret<string>('ssh-host-key-ecdsa-pub'),
    rsa: config.getSecret<string>('ssh-host-key-rsa'),
    rsaPub: config.getSecret<string>('ssh-host-key-rsa-pub'),
})

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

    constructor(
        name: string,
        args: GatewayArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:gateway/Gateway', name, args, opts)

        const routes = pulumi.output(args.openvpn.routedCidrs).apply((cidrs) =>
            (cidrs ?? []).map((cidr) => {
                const subnet = new Netmask(cidr)
                return `route ${subnet.base} ${subnet.mask}`
            }),
        )

        const openVpnConfig = pulumi
            .all([
                routes,
                args.openvpn.tunnel.localAddress,
                args.openvpn.tunnel.remoteAddress,
                args.openvpn.listenOnPort,
                args.openvpn.remote.address,
                args.openvpn.remote.port,
            ])
            .apply(
                ([
                    routes,
                    localTunnelAddress,
                    remoteTunnelAddress,
                    listenOnPort,
                    remoteAddress,
                    remotePort,
                ]) =>
                    [
                        `ifconfig ${localTunnelAddress} ${remoteTunnelAddress}`,
                        `dev tun`,
                        `secret static.key`,
                        `keepalive 10 60`,
                        `ping-timer-rem`,
                        `persist-tun`,
                        `persist-key`,
                        `user nobody`,
                        `group nobody`,
                        ...routes,
                        `port ${listenOnPort ?? 1194}`,
                        `remote ${remoteAddress} ${remotePort ?? 1194}`,
                    ].join('\n') + '\n',
            )

        const userData = pulumi
            .all([
                config.requireSecret('openvpn-shared-secret'),
                args.natCidrs,
                openVpnConfig,
            ])
            .apply(([key, natCidrs, openVpnConfig]) => ({
                ...defaultUserData,
                packages: [...defaultUserData.packages, 'openvpn'],
                write_files: [
                    ...defaultUserData.write_files,
                    {
                        path: '/etc/openvpn/server.conf',
                        owner: 'root:root',
                        permissions: '0644',
                        content: openVpnConfig,
                    },
                    {
                        path: '/etc/openvpn/static.key',
                        owner: 'root:root',
                        permissions: '0600',
                        content: key,
                    },
                ],
                bootcmd: [
                    ...defaultUserData.bootcmd,
                    'echo 1 > /proc/sys/net/ipv4/ip_forward',
                    'echo 1 > /proc/sys/net/ipv4/conf/eth0/proxy_arp',
                    ...(natCidrs ?? []).map(
                        (cidr) =>
                            `iptables -t nat -A POSTROUTING -o eth0 -s ${cidr} -j MASQUERADE`,
                    ),
                ],
                runcmd: [
                    ...defaultUserData.runcmd,
                    'systemctl enable openvpn@server',
                    'systemctl start openvpn@server',
                ],
            }))

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
                sshHostKeys,
                notificationsTopicArn: args.notificationsTopicArn,
            },
            { parent: this },
        )

        this.ip = instance.ip
        this.ipv6 = instance.ipv6
        this.hostname = pulumi.output(instance.hostname).apply(
            (hostname) =>
                hostname ??
                (() => {
                    throw new pulumi.ResourceError(
                        'gateway hostname missing!',
                        this,
                    )
                })(),
        )
        this.instanceId = instance.instanceId
        this.interfaceId = instance.interfaceId
        this.publicIp = instance.publicIp!
        this.privateIp = instance.privateIp
    }
}
