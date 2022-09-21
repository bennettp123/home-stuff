import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

/**
 * Creates cost alerts for AWS services within the account. Alerts are
 * forwarded to SNS topics (specified using `args.subscriberArns`).
 *
 * There should only be one instance of this class per stack.
 */
export class CostAlerts extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            /**
             * The SNS topic ARNs to be subscribed to cost alerts
             */
            subscriberArns: pulumi.Input<pulumi.Input<string>[]>

            /**
             * The threshold that triggers a notification, if exceeded, in
             * dollars. (US dollars?)
             */
            anomalyThreshold?: pulumi.Input<number>
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:monitoring/CostAlerts', name, args, opts)

        /**
         * Raise alerts on individual AWS services
         * -- equivalent to `Monitor Type: AWS services`
         * in the cost explorer console
         */
        const awsCostAlerts = new aws.costexplorer.AnomalyMonitor(
            `${name}-aws-services`,
            {
                name: `${name}-aws-services`,
                monitorType: 'DIMENSIONAL',
                monitorDimension: 'SERVICE',
            },
            { parent: this },
        )

        new aws.costexplorer.AnomalySubscription(
            `${name}-slack-bennettp123`,
            {
                name: `${name}-slack-bennettp123`,
                frequency: 'IMMEDIATE',
                monitorArnLists: [awsCostAlerts.arn],
                subscribers: pulumi
                    .output(args.subscriberArns)
                    .apply((arns) =>
                        arns.map((address) => ({ address, type: 'SNS' })),
                    ),
                threshold: pulumi
                    .output(args.anomalyThreshold)
                    .apply((threshold) => threshold ?? 5),
            },
            { parent: this },
        )
    }
}
