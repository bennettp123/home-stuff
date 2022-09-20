import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'

const config = new pulumi.Config('ssm-automations')

export class SsmAutomations extends pulumi.ComponentResource {
    patchGroup: pulumi.Output<string>

    constructor(name: string, args: {}, opts: pulumi.ComponentResourceOptions) {
        super('bennettp123:SsmAutomations', name, {}, opts)

        const patchGroupName = `${name}-amazon-linux-2-aggressive-patching`
        this.patchGroup = pulumi.output(patchGroupName)

        if (!config.getBoolean('enable-automations')) {
            return
        }

        /**
         * Matches ALL instances
         */
        const allInstances: aws.ssm.AssociationArgs['targets'] = [
            {
                key: 'InstanceIds',
                values: ['*'],
            },
        ]

        /**
         * Update the SSM agent to the latest version.
         */
        new aws.ssm.Association(
            `${name}-update-ssm-agent`,
            {
                name: 'AWS-UpdateSSMAgent',
                associationName: `${name}-update-ssm-agent`,
                targets: allInstances,
                complianceSeverity: 'LOW',
                maxErrors: '5%',
                maxConcurrency: '10',
                scheduleExpression: 'rate(1 day)',
            },
            { parent: this },
        )

        /**
         * Modified version of AWS-AmazonLinux2DefaultPatchBaseline, with
         * quicker approval of updates.
         *
         * ```sh
         * aws ssm get-patch-baseline --baseline-id \
         *   'arn:aws:ssm:ap-southeast-2:547428446776:patchbaseline/pb-0cbcee000772c53a7'
         * ```
         */
        const patchBaseline = new aws.ssm.PatchBaseline(
            name,
            {
                name: `${name}-amazon-linux-2-aggressive-patching`,
                tags: {
                    PatchGroup: this.patchGroup,
                },
                description:
                    'Same as AWS-AmazonLinux2DefaultPatchBaseline, but ' +
                    'with quicker auto-approvals and non-security updates',
                operatingSystem: 'AMAZON_LINUX_2',
                globalFilters: [
                    {
                        key: 'PRODUCT',
                        values: ['*'],
                    },
                ],
                approvalRules: [
                    {
                        approveAfterDays: 0,
                        complianceLevel: 'CRITICAL',
                        enableNonSecurity: true,
                        patchFilters: [
                            {
                                key: 'CLASSIFICATION',
                                values: ['Security'],
                            },
                            {
                                key: 'SEVERITY',
                                values: ['Critical', 'Important'],
                            },
                        ],
                    },
                    {
                        approveAfterDays: 2,
                        complianceLevel: 'MEDIUM',
                        enableNonSecurity: true,
                        patchFilters: [
                            {
                                key: 'CLASSIFICATION',
                                values: ['Bugfix'],
                            },
                        ],
                    },
                ],
                rejectedPatchesAction: 'ALLOW_AS_DEPENDENCY',
            },
            { parent: this },
        )

        new aws.ssm.PatchGroup(
            patchGroupName,
            { baselineId: patchBaseline.id, patchGroup: patchGroupName },
            { parent: this },
        )

        const now = new Date()
        const date = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`

        /**
         * All servers with the same Snapshot ID will get the same set of
         * patches installed.
         */
        const snapshotId = new random.RandomUuid(
            `${name}-snapshot-id`,
            {
                keepers: {
                    date,
                },
            },
            { parent: this },
        ).result

        new aws.ssm.Association(
            `${name}-patch-baseline`,
            {
                name: 'AWS-RunPatchBaseline',
                associationName: `${name}-patch-baseline`,
                targets: allInstances,
                maxErrors: '5%',
                maxConcurrency: '10',
                scheduleExpression: 'rate(1 day)',
                parameters: {
                    SnapshotId: snapshotId,
                    Operation: 'Install',
                    RebootOption: 'RebootIfNeeded',
                },
            },
            { parent: this },
        )
    }
}
