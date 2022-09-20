import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as openpgp from 'openpgp'
import { MailServer } from './mail-server'

const config = new pulumi.Config('common')
const privKey = config.requireSecret<string>('pgp-private-key')
const pubKey = config.requireSecret<string>('pgp-public-key')
const passphrase = config.requireSecret<string>('pgp-passphrase')

/**
 * Creates an IAM account with permission to send and recieve mail using SES.
 */
export class MailUser extends pulumi.ComponentResource {
    username: pulumi.Output<string>
    password: pulumi.Output<string>
    constructor(
        name: string,
        args: {
            /**
             * The mail server from which mail is to be sent
             */
            mailServer: pulumi.Input<MailServer>
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:mail-user/MailUser', name, {}, opts)

        const user = new aws.iam.User(name, {}, { parent: this })

        new aws.iam.UserPolicy(
            name,
            {
                user: user.id,
                policy: pulumi
                    .output(args.mailServer)
                    .apply((mailServer) => mailServer.identity.arn)
                    .apply((resource) =>
                        aws.iam.getPolicyDocument(
                            {
                                statements: [
                                    {
                                        sid: 'AllowSendingMail',
                                        effect: 'Allow',
                                        actions: ['ses:SendRawEmail'],
                                        resources: [resource],
                                    },
                                ],
                            },
                            { parent: this },
                        ),
                    ).json,
            },
            { parent: this },
        )

        const accessKey = new aws.iam.AccessKey(
            name,
            {
                user: user.id,
                pgpKey: pubKey,
            },
            { parent: this },
        )

        this.username = accessKey.id
        this.password = pulumi.secret<string>(
            pulumi
                .all([
                    accessKey.encryptedSesSmtpPasswordV4,
                    privKey,
                    passphrase,
                ])
                .apply<string>(async ([encrypted, privKey, passphrase]) => {
                    const privateKey = await openpgp.decryptKey({
                        privateKey: await openpgp.readPrivateKey({
                            binaryKey: Buffer.from(privKey, 'base64'),
                        }),
                        passphrase,
                    })

                    const buf = Buffer.from(encrypted, 'base64')
                    const message = await openpgp.readMessage({
                        binaryMessage: buf,
                    })

                    const { data: decrypted } = await openpgp.decrypt({
                        message,
                        format: 'binary',
                        decryptionKeys: privateKey,
                    })

                    return Buffer.from(decrypted).toString()
                }),
        )
    }
}
