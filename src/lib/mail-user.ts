import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as openpgp from 'openpgp'
import { types } from 'util'
import { MailServer } from './mail-server'

/**
 * can't use this becuase pulumi can't import its types, and for some reason
 * also refuses to import custom types when you declare them in a .d.ts file
 */
//import { readToEnd } from '@openpgp/web-stream-tools'

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
                .apply(async ([encrypted, privKey, passphrase]) => {
                    const privateKey = await openpgp.decryptKey({
                        privateKey: await openpgp.readPrivateKey({
                            binaryKey: Buffer.from(privKey, 'base64'),
                        }),
                        passphrase: passphrase,
                    })

                    const messageBuffer = Buffer.from(encrypted, 'base64')
                    const encryptedMessage = await openpgp.readMessage<Buffer>({
                        binaryMessage: messageBuffer,
                    })

                    const { data: plaintextMessage } =
                        await openpgp.decrypt<Buffer>({
                            message: encryptedMessage,
                            format: 'binary',
                            decryptionKeys: privateKey,
                        })

                    /**
                     * this is the _right_ way to do it, but for some reason,
                     * pulumi can't import the already existing types provided
                     * by @openpgp/web-stream-tools
                     *
                     * So instead, just check if it's UInt8Array, and throw
                     * if it isn't
                     */
                    //return Buffer.from(
                    //    await readToEnd(plaintextMessage),
                    //).toString()

                    if (types.isUint8Array(plaintextMessage)) {
                        return Buffer.from(plaintextMessage).toString()
                    }

                    throw new pulumi.ResourceError('unhandled type', this)
                }),
        )
    }
}
