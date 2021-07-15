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
`

export class JumpBox extends pulumi.ComponentResource {
    ip: pulumi.Output<string>
    ipv6: pulumi.Output<string>

    constructor(
        name: string,
        args: {
            publicSubnetIds: pulumi.Input<string[]>
            vpcId: pulumi.Input<string>
            securityGroups: pulumi.Input<string>[]
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

        // the smollest possible instance type
        const instance = new aws.ec2.Instance(
            `${name}-instance`,
            {
                instanceType: 't4g.nano',
                ami: getAmazonLinux2AmiId({ arch: 'arm64' }, { parent: this }),
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
                instanceInitiatedShutdownBehavior: 'terminate',
            },
            { parent: this },
        )

        // associates the static IP with the instance
        new aws.ec2.EipAssociation(
            `${name}-eip-assoc`,
            {
                publicIp: eip.publicIp,
                allocationId: eip.allocationId,
                instanceId: instance.id,
            },
            { parent: this },
        )

        this.ip = eip.publicIp
        this.ipv6 = pulumi
            .output(instance.ipv6Addresses)
            .apply((addresses) => addresses.join(', '))

        this.registerOutputs({
            ip: this.ip,
            ipv6: this.ipv6,
        })
    }
}

