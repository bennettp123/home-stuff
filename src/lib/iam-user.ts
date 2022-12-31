import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as openpgp from 'openpgp'
import { isUint8Array } from 'util/types'

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
                                              passphrase: passphrase,
                                          })

                                      const messageBuffer = Buffer.from(
                                          encrypted,
                                          'base64',
                                      )
                                      const encryptedMessage =
                                          await openpgp.readMessage<Buffer>({
                                              binaryMessage: messageBuffer,
                                          })

                                      const { data: plaintextMessage } =
                                          await openpgp.decrypt<Buffer>({
                                              message: encryptedMessage,
                                              format: 'binary',
                                              decryptionKeys: privateKey,
                                          })

                                      /**
                                       * this is the _right_ way to do it, but
                                       * for some reason, pulumi can't import
                                       * the already existing types provided
                                       * by @openpgp/web-stream-tools
                                       *
                                       * So instead, just check if it's
                                       * UInt8Array, and throw if it isn't
                                       */
                                      //return Buffer.from(
                                      //    await readToEnd(plaintextMessage),
                                      //).toString()

                                      if (isUint8Array(plaintextMessage)) {
                                          return Buffer.from(
                                              plaintextMessage,
                                          ).toString()
                                      }

                                      throw new pulumi.ResourceError(
                                          'unhandled type',
                                          this,
                                      )
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
