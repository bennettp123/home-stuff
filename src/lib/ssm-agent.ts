import * as aws from '@pulumi/aws'

export function getSsmAgentUrl({
    region,
    arch,
    os,
}: {
    region?: string
    arch: 'amd64' | 'arm64'
    os?: 'linux'
}) {
    region = region ?? 'ap-southeast-2'
    os = os ?? 'linux'

    return `https://s3.${region}.amazonaws.com/amazon-ssm-${region}/latest/${os}_${arch}/amazon-ssm-agent.rpm`
}

// https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-profile.html#instance-profile-policies-overview
export const instancePolicies = [
    aws.iam.ManagedPolicies.AmazonSSMManagedInstanceCore,
]
