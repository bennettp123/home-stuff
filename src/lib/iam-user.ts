import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as openpgp from 'openpgp'

const config = new pulumi.Config('common')
const privKey = config.requireSecret<string>('pgp-private-key')
const pubKey = config.requireSecret<string>('pgp-public-key')
const passphrase = config.requireSecret<string>('pgp-passphrase')

/**
 * Creates an IAM account with an optional key pair
 */
export class IamUser extends pulumi.ComponentResource {
    user: aws.iam.User
    accessKeyId: pulumi.Output<string | undefined>
    secretAccessKey: pulumi.Output<string | undefined>
    constructor(
        name: string,
        args?: {
            generateKeyPair?: pulumi.Input<boolean>
            tags?: {
                [key: string]: string
            }
        },
        opts?: pulumi.ComponentResourceOptions & {
            fromUser?: pulumi.ComponentResourceOptions['aliases']
        },
    ) {
        super('bennettp123:iam-user/IamUser', name, {}, opts)

        this.user = new aws.iam.User(
            name,
            {
                forceDestroy: true,
                tags: args?.tags,
            },
            {
                parent: this,
                aliases: opts?.fromUser,
            },
        )

        const accessKey = pulumi
            .output(args?.generateKeyPair)
            .apply((generateKeyPair) =>
                generateKeyPair
                    ? new aws.iam.AccessKey(
                          name,
                          {
                              user: this.user.id,
                              pgpKey: pubKey,
                          },
                          { parent: this },
                      )
                    : undefined,
            )

        this.accessKeyId = pulumi
            .output(accessKey)
            .apply((accessKey) => (accessKey ? accessKey.id : undefined))
            .apply((accessKeyId) =>
                pulumi
                    .output(accessKeyId)
                    .apply((accessKeyId) => accessKeyId ?? undefined),
            )

        this.secretAccessKey = pulumi
            .output(accessKey)
            .apply((accessKey) =>
                accessKey
                    ? pulumi.secret(
                          pulumi
                              .all([
                                  accessKey.encryptedSecret,
                                  privKey,
                                  passphrase,
                              ])
                              .apply(
                                  async ([encrypted, privKey, passphrase]) => {
                                      const privateKey =
                                          await openpgp.decryptKey({
                                              privateKey:
                                                  await openpgp.readPrivateKey({
                                                      binaryKey: Buffer.from(
                                                          privKey,
                                                          'base64',
                                                      ),
                                                  }),
                                              passphrase,
                                          })

                                      const buf = Buffer.from(
                                          encrypted,
                                          'base64',
                                      )
                                      const message = await openpgp.readMessage(
                                          {
                                              binaryMessage: buf,
                                          },
                                      )

                                      const { data: decrypted } =
                                          await openpgp.decrypt({
                                              message,
                                              format: 'binary',
                                              decryptionKeys: privateKey,
                                          })

                                      return Buffer.from(decrypted).toString()
                                  },
                              ),
                      )
                    : undefined,
            )
            .apply((secretAccessKey) =>
                pulumi
                    .output(secretAccessKey)
                    .apply((secretAccessKey) => secretAccessKey ?? undefined),
            )
    }
}
