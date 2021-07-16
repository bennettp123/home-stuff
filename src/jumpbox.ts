import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

// https://aws.amazon.com/blogs/compute/query-for-the-latest-amazon-linux-ami-ids-using-aws-systems-manager-parameter-store/
export const getAmazonLinux2AmiId = (
    args?: {
        arch?: 'x86_64' | 'arm64'
    },
    opts?: pulumi.InvokeOptions,
): Promise<string> => {
    return aws.ssm
        .getParameter(
            {
                name: `/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-hvm-${
                    args?.arch ?? 'x86_64'
                }-ebs`,
            },
            { ...opts, async: true },
        )
        .then((result) => result.value)
        .catch((reason) => {
            pulumi.log.error(`Error getting Amazon Linux 2 AMI ID: ${reason}`)
            throw reason
        })
}

export const logins = {
    bennett: [
        'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAO1Tdp+UuSgRQO9krfyqZXSVMt6mSH1RZX2AWxQboxH bennett@MacBook Pro 16',
    ]
}

export const sudoers = ['bennett']

// examples: https://cloudinit.readthedocs.io/en/latest/topics/examples.html#including-users-and-groups
const users = Object.entries(logins)
    .map(([name, ssh_authorized_keys]) => {
        return {
            name,
            ssh_authorized_keys,
            ...(sudoers.includes(name)
                ? { sudo: 'ALL=(ALL) NOPASSWD:ALL' }
                : {}),
        }
    })
    .filter((user) => user.ssh_authorized_keys.length > 0)


export const userData = `#cloud-config
repo_upgrade: all
ssh_deletekeys: true
users: ${JSON.stringify(users)}
repo_update: true
yum_repos:
  epel:
    name: Extra Packages for Enterprise Linux 7 - $basearch
    mirrorlist: https://mirrors.fedoraproject.org/metalink?repo=epel-7&arch=$basearch&infra=$infra&content=$contentdir
    failovermethod: priority
    enabled: true
    gpgcheck: true
    gpgkey: https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-7
packages:
  - openvpn
write_files:
  - path: /etc/openvpn/server.conf
    owner: root:root
    permissions: '0644'
    content: |
      ifconfig 192.168.127.2 192.168.127.1
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
  - path: /etc/openvpn/static.key
    owner: root:root
    permissions: '0600'
    content: |
      #
      # 2048 bit OpenVPN static key
      #
      -----BEGIN OpenVPN Static key V1-----
      57fdc295a505e7534bddafa12b0ae75a
      a122febd739207ebce55be21a0c0fffe
      0387b9cd47e71deea463611f579142a2
      7122a1ac04431c53340090d59d6491ab
      6dd39e7dbfd105c104dc6e962db8b9d0
      53c9929da34add07ccc9687ede6fec06
      b60a8c97bd125fe8a5b433daf2a78781
      6d7e3cf483538585b09dbc220f4e6fc7
      2f1843d6f7d969231703c937517a4857
      2725192af4022d2a3e5af0cd51f08a69
      ad16a4f7723423f92f5a46804793fe8a
      6c49ad8757f8903ed3595e92f935a78d
      66417df940206251bac03161d3d2a952
      086ba1f72fcddd2ff493f456dc866851
      800942fc78a4ee7bfeb045db8c4dec8d
      7fddaf48bfc98da3fd3782b00ee5093d
      -----END OpenVPN Static key V1-----
runcmd:
  - echo 1 > /proc/sys/net/ipv4/ip_forward
  - echo 1 > /proc/sys/net/ipv4/conf/eth0/proxy_arp
  - systemctl enable openvpn@server
  - systemctl start openvpn@server
`

export class JumpBox extends pulumi.ComponentResource {
    ip: pulumi.Output<string>
    ipv6: pulumi.Output<string>
    hostname?: pulumi.Output<string>

    constructor(
        name: string,
        args: {
            publicSubnetIds: pulumi.Input<string[]>
            vpcId: pulumi.Input<string>
            securityGroups: pulumi.Input<string>[]
            dnsZone?: pulumi.Input<string>
            hostname?: pulumi.Input<string>
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:jumpbox/Jumpbox', name, args, opts)

        const vpc = pulumi
            .output(args.vpcId)
            .apply((id) => aws.ec2.getVpc({ id }, { parent: this }))

        // an Elastic IP provides a static IP address
        const eip = new aws.ec2.Eip(
            `${name}-eip`,
            { vpc: true },
            { parent: this },
        )

        const tenyears = 10 * 365 * 24 * 60 * 60 * 1000

        // the smollest possible instance type
        const instance = new aws.ec2.SpotInstanceRequest(
            `${name}-instance`,
            {
                instanceType: 't3a.nano',
                ami: getAmazonLinux2AmiId({ arch: 'x86_64' }, { parent: this }),
                subnetId: pulumi
                    .output(args.publicSubnetIds)
                    .apply((ids) => ids[0]),
                vpcSecurityGroupIds: args.securityGroups,
                userData,
                rootBlockDevice: {
                    deleteOnTermination: true,
                    volumeSize: 4,
                    volumeType: 'gp3',
                },
                instanceInitiatedShutdownBehavior: 'stop',
                spotType: 'persistent',
                creditSpecification: {
                    cpuCredits: 'standard',
                },
                disableApiTermination: true,
                instanceInterruptionBehaviour: 'stop',
                waitForFulfillment: true,
                validUntil: `${new Date(
                    // reset date about every 10 years
                    (Date.now()+tenyears) - ((Date.now()+tenyears) % tenyears)
                )
                .toISOString()
                .replace(/00Z$/, '0Z') // just the last two zeros
            }`
            },
            {
                parent: this,
                ignoreChanges: ['validUntil'],
            },
        )

        // associates the static IP with the instance
        new aws.ec2.EipAssociation(
            `${name}-eip-assoc`,
            {
                publicIp: eip.publicIp,
                instanceId: instance.spotInstanceId,
            },
            { parent: this },
        )

        this.ip = eip.publicIp
        this.ipv6 = pulumi
            .output(instance.ipv6Addresses)
            .apply((addresses) => addresses.join(', '))

        if (args.dnsZone && args.hostname) {

            const aaaa = new aws.route53.Record(`${name}-aaaa`,
            {
                name: args.hostname,
                type: 'AAAA',
                zoneId: args.dnsZone,
                ttl: 60,
                records: [this.ipv6],
            },
            { parent: this })
            
            const a = new aws.route53.Record(`${name}-a`,
            {
                name: args.hostname,
                type: 'A',
                zoneId: args.dnsZone,
                ttl: 60,
                records: [this.ip],
            },
            { parent: this })

            this.hostname = pulumi.all([aaaa.fqdn, a.fqdn]).apply(([fqdn, _]) => fqdn)
        }

        this.registerOutputs({
            ip: this.ip,
            ipv6: this.ipv6,
            hostname: this.hostname,
        })
    }
}

