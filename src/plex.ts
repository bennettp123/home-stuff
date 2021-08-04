import * as pulumi from '@pulumi/pulumi'
import { addRepo } from './helpers'
import { Instance, InstanceArgs, userData as defaultUserData } from './instance'

export interface KodiArgs extends Partial<InstanceArgs> {
    /**
     * The underlying instance will be added to subnets with these IDs
     */
    subnetIds: pulumi.Input<string[]>

    /**
     * The instance will be added to the VPC with this ID
     */
    vpcId: pulumi.Input<string>

    /**
     * Security groups with these IDs will be applied to the kodi interface
     */
    securityGroupIds: pulumi.Input<string>[]

    /**
     * DNS settings for the kodi instance
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
     * An SNS topic for sending notifications
     */
    notificationsTopicArn: pulumi.Input<string>
}

export class Plex extends pulumi.ComponentResource {
    /**
     * The public IP address of the kodi instance.
     */
    ip: pulumi.Output<string>

    /**
     * The public IP address of the kodi instance.
     */
    publicIp: pulumi.Output<string>

    /**
     * The private IP address of the kodi instance.
     */
    privateIp: pulumi.Output<string>

    /**
     * The IPv6 address of the kodi instance.
     */
    ipv6: pulumi.Output<string>

    /**
     * The hostname of the kodi instance
     */
    hostname: pulumi.Output<string>

    /**
     * The instance ID of the kodi instance
     */
    instanceId: pulumi.Output<string>

    /**
     * The ID of the network interface attached to the gatway instance
     */
    interfaceId: pulumi.Output<string>

    constructor(
        name: string,
        args: KodiArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:plex/Plex', name, {}, opts)

        const userData = addRepo(
            {
                ...defaultUserData,
                packages: [...defaultUserData.packages, 'plexmediaserver'],
            },
            {
                PlexRepo: {
                    name: 'PlexRepo',
                    baseurl: 'https://downloads.plex.tv/repo/rpm/$basearch/',
                    enabled: true,
                    gpgcheck: true,
                    gpgkey: 'https://downloads.plex.tv/plex-keys/PlexSign.key',
                },
            },
        )

        const instance = new Instance(
            name,
            {
                subnetIds: args.subnetIds,
                instanceType: 't3a.nano',
                vpcId: args.vpcId,
                securityGroupIds: args.securityGroupIds,
                userData,
                network: {
                    fixedPrivateIp: true,
                    fixedIpv6: true,
                    useENI: true,
                },
                dns: args.dns,
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
