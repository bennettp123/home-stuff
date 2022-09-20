import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config('ssm-automations')

export class SsmAutomations extends pulumi.ComponentResource {
    constructor(name: string, args: {}, opts: pulumi.ComponentResourceOptions) {
        super('swm:news-mono:SsmAutomations', name, {}, opts)

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
    }
}
