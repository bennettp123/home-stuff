import * as pulumi from '@pulumi/pulumi'
import { Instance, InstanceArgs, userData as defaultUserData } from './instance'

const config = new pulumi.Config('jumpbox')

const openVpnConfig = `ifconfig 192.168.127.2 192.168.127.1
dev tun
secret static.key
keepalive 10 60
ping-timer-rem
persist-tun
persist-key
user nobody
group nobody
route 192.168.0.0 255.255.192.0
route 192.168.128.0 255.255.192.0
route 192.168.192.0 255.255.192.0
port 1194
remote 210.10.212.154 1194
`

export const userData = pulumi.interpolate`${defaultUserData}
packages:
  - openvpn
  - bind-utils
write_files:
  - path: /etc/cron.d/automatic-upgrades
    owner: root:root
    permissions: '0644'
    content: |
      0 * * * * root yum upgrade -y
  - path: /etc/openvpn/server.conf
    owner: root:root
    permissions: '0644'
    content: ${JSON.stringify(openVpnConfig)}
  - path: /etc/openvpn/static.key
    owner: root:root
    permissions: '0600'
    content: ${pulumi
        .output(config.requireSecret('openvpn-shared-secret'))
        .apply((content) => JSON.stringify(content))}
runcmd:
  - echo 1 > /proc/sys/net/ipv4/ip_forward
  - echo 1 > /proc/sys/net/ipv4/conf/eth0/proxy_arp
  - systemctl enable openvpn@server
  - systemctl start openvpn@server
`

interface JumpboxArgs extends InstanceArgs {
    dns: {
        zone: pulumi.Input<string>
        hostname: pulumi.Input<string>
    }
}

/**
 * Jumpbox provides two things:
 *  - an SSH target to connect to remotely
 *  - an OpenVPN server that connects back to the unifi router at home
 */
export class JumpBox extends pulumi.ComponentResource {
    ip: pulumi.Output<string>
    publicIp: pulumi.Output<string>
    privateIp: pulumi.Output<string>
    ipv6: pulumi.Output<string>
    hostname?: pulumi.Output<string>
    instanceId: pulumi.Output<string>
    interfaceId: pulumi.Output<string>

    constructor(
        name: string,
        args: JumpboxArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:jumpbox/Jumpbox', name, args, opts)

        const instance = new Instance(
            name,
            {
                subnetIds: args.subnetIds,
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
            },
            { parent: this },
        )

        this.ip = instance.ip
        this.ipv6 = instance.ipv6
        this.hostname = instance.hostname
        this.instanceId = instance.instanceId
        this.interfaceId = instance.interfaceId
        this.publicIp = instance.publicIp!
        this.privateIp = instance.privateIp
    }
}
