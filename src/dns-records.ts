import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

/**
 * See https://serverfault.com/a/954501
 *
 * A DNS record is made up of one or more parts, and the max size
 * of each part is 255 characters.
 *
 * Unfortunately neither terraform nor Route53 split records into smaller parts,
 * so we have to do it ourselves.
 */
export function txtRecord(s: string) {
    return (s.match(/.{1,255}/g) ?? []).map((entry) => entry ?? '').join('" "')
}

const mailConfig = new pulumi.Config('mail')

const mailProvider = mailConfig.get<string>('provider') as 'gmail' | 'icloud'

const getZoneId = (name: string) =>
    pulumi.output(aws.route53.getZone({ name })).zoneId

const zoneId = Object.fromEntries(
    [
        'bennettp123.com',
        'home.bennettp123.com',
        'no-vaccine-for-you.com',
        'fukaxe.com',
    ].map((name) => [name, getZoneId(name)]),
)

pulumi
    .all(Object.entries(zoneId))
    .apply((zoneId) => Object.fromEntries(zoneId))
    .apply((zoneId) => pulumi.log.info(`zone ids: ${JSON.stringify(zoneId)}`))

const iCloudRecordsForCustomMailDomain = (args: {
    name: string
    zoneId?: aws.route53.RecordArgs['zoneId']
    proofOfDomainOwnership: string
    createApexTxt?: boolean | { aliases: pulumi.ResourceOptions['aliases'] }
    mx?: {
        name?: aws.route53.RecordArgs['name']
        zoneId?: aws.route53.RecordArgs['zoneId']
        records?: aws.route53.RecordArgs['records']
        allowOverwrite?: aws.route53.RecordArgs['allowOverwrite']
        aliases?: pulumi.ResourceOptions['aliases']
    }
    spf?: {
        name?: aws.route53.RecordArgs['name']
        zoneId?: aws.route53.RecordArgs['zoneId']
        type?: 'TXT' | 'SPF'
        records?: aws.route53.RecordArgs['records']
        allowOverwrite?: aws.route53.RecordArgs['allowOverwrite']
        aliases?: pulumi.ResourceOptions['aliases']
    }
    dmarc?: {
        name?: aws.route53.RecordArgs['name']
        zoneId?: aws.route53.RecordArgs['zoneId']
        records?: aws.route53.RecordArgs['records']
        allowOverwrite?: aws.route53.RecordArgs['allowOverwrite']
        aliases?: pulumi.ResourceOptions['aliases']
    }
    dkim?: [
        {
            name?: aws.route53.RecordArgs['name']
            zoneId?: aws.route53.RecordArgs['zoneId']
            type?: 'CNAME' | aws.route53.RecordArgs['type']
            records?: aws.route53.RecordArgs['records']
            allowOverwrite?: aws.route53.RecordArgs['allowOverwrite']
            aliases?: pulumi.ResourceOptions['aliases']
        },
    ]
}) => ({
    proofOfDomainOwnership: args.proofOfDomainOwnership,
    mx: new aws.route53.Record(
        `${args.name}-mx`,
        {
            name: args.mx?.name ?? args.name,
            zoneId: args.mx?.zoneId ?? args.zoneId ?? zoneId[args.name],
            type: 'MX',
            ttl: 300,
            records: args.mx?.records ?? [
                '10 mx01.mail.icloud.com.',
                '10 mx02.mail.icloud.com.',
            ],
            allowOverwrite: args.mx?.allowOverwrite ?? false,
        },
        { deleteBeforeReplace: true, aliases: args.mx?.aliases },
    ),
    spf:
        args.createApexTxt ?? true
            ? {
                  records: args.spf?.records ?? [
                      'v=spf1 include:icloud.com ~all',
                  ],
              }
            : new aws.route53.Record(
                  `${args.name}-spf`,
                  {
                      name: args.spf?.name ?? args.name,
                      zoneId:
                          args.spf?.zoneId ?? args.zoneId ?? zoneId[args.name],
                      type: args.spf?.type ?? 'SPF',
                      ttl: 300,
                      records: args.spf?.records ?? [
                          'v=spf1 include:icloud.com ~all',
                      ],
                      allowOverwrite: args.spf?.allowOverwrite,
                  },
                  { deleteBeforeReplace: true, aliases: args.spf?.aliases },
              ),
    txt:
        args.createApexTxt ?? true
            ? new aws.route53.Record(
                  `${args.name}-txt`,
                  {
                      name: args.name,
                      type: 'TXT',
                      zoneId: args.zoneId ?? zoneId[args.name],
                      ttl: 300,
                      records: pulumi
                          .all([args.spf?.records, args.proofOfDomainOwnership])
                          .apply(([icloudSpf, proofOfDomainOwnership]) => [
                              proofOfDomainOwnership,
                              ...(icloudSpf
                                  ? icloudSpf
                                  : ['v=spf1 include:icloud.com ~all']),
                          ]),
                      allowOverwrite: false,
                  },
                  {
                      deleteBeforeReplace: true,
                      aliases:
                          typeof args.createApexTxt !== 'boolean'
                              ? args.createApexTxt?.aliases
                              : undefined,
                  },
              )
            : undefined,
    dmarc: new aws.route53.Record(
        `${args.name}-dmarc`,
        {
            name: args.dmarc?.name ?? `_dmarc.${args.name}`,
            zoneId: args.dmarc?.zoneId ?? args.zoneId ?? zoneId[args.name],
            type: 'TXT',
            ttl: 300,
            records: args.dmarc?.records ?? [
                `v=DMARC1; p=quarantine; rua=mailto:monitor@${args.name}; fo=0; adkim=s; aspf=s; pct=100; rf=afrf; sp=quarantine`,
            ],
            allowOverwrite: args.dmarc?.allowOverwrite,
        },
        { deleteBeforeReplace: true, aliases: args.dmarc?.aliases },
    ),
    ...Object.fromEntries(
        (
            args.dkim ?? [
                {
                    name: undefined,
                    zoneId: undefined,
                    type: undefined,
                    records: undefined,
                    allowOverwrite: undefined,
                    aliases: undefined,
                },
            ]
        ).map((dkim, idx) => [
            `dkim${idx}`,
            new aws.route53.Record(
                `${args.name}-dkim${idx + 1}`,
                {
                    name: dkim.name ?? `sig${idx + 1}._domainkey.${args.name}`,
                    zoneId: dkim.zoneId ?? args.zoneId ?? zoneId[args.name],
                    type: dkim.type ?? 'CNAME',
                    ttl: 300,
                    records: dkim.records ?? [
                        `sig${idx + 1}.dkim.${
                            args.name
                        }.at.icloudmailadmin.com.`,
                    ],
                    allowOverwrite: dkim.allowOverwrite,
                },
                { deleteBeforeReplace: true, aliases: dkim.aliases },
            ),
        ]),
    ),
})

let spf:
    | aws.route53.Record
    | { records: aws.route53.RecordArgs['records'] }
    | undefined = undefined

let iCloudProof: string | undefined = undefined

if (mailProvider === 'gmail') {
    new aws.route53.Record(
        'mail-cname',
        {
            name: 'mail.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'CNAME',
            ttl: 300,
            records: ['ghs.google.com'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'calendar-cname',
        {
            name: 'calendar.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'CNAME',
            ttl: 300,
            records: ['ghs.google.com'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'docs-cname',
        {
            name: 'docs.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'CNAME',
            ttl: 300,
            records: ['ghs.google.com'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'mx',
        {
            name: 'bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'MX',
            ttl: 300,
            records: [
                '1  aspmx.l.google.com.',
                '5  alt1.aspmx.l.google.com.',
                '5  alt2.aspmx.l.google.com.',
                '10 aspmx2.googlemail.com.',
                '10 aspmx3.googlemail.com.',
            ],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    // see also TXT record
    spf = new aws.route53.Record(
        'spf',
        {
            name: 'bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'SPF',
            ttl: 300,
            records: ['v=spf1 include:_spf.google.com ~all'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'dmarc',
        {
            name: '_dmarc.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'TXT',
            ttl: 300,
            records: [
                'v=DMARC1; p=quarantine; rua=mailto:monitor@bennettp123.com; fo=0; adkim=s; aspf=s; pct=100; rf=afrf; sp=quarantine',
            ],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'dkim',
        {
            name: 'google._domainkey.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'TXT',
            ttl: 300,
            records: [
                'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCaszIojAOVVhyOIWDiVKggvAaocGaLsFz8dFAB4c+fIUOCFd5ABSvDaxkL+ShAmT9mbPTPyHoRrM3CpXhjbsCnh7fA1TACDSVV4GMbXgyWkwW2fqZkLbxHx7/9Oi098ts6asGPlyeSrOmbOqvgntLwdQDMPXPmv1t0E3JMZ1KUkwIDAQAB',
            ],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-mx',
        {
            name: 'home.bennettp123.com',
            type: 'MX',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: [
                '1	ASPMX.L.GOOGLE.COM.',
                '5	ALT1.ASPMX.L.GOOGLE.COM.',
                '5	ALT2.ASPMX.L.GOOGLE.COM.',
                '10	ALT3.ASPMX.L.GOOGLE.COM.',
                '10	ALT4.ASPMX.L.GOOGLE.COM.',
            ],
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-txt',
        {
            name: 'home.bennettp123.com',
            type: 'TXT',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: ['v=spf1 include:_spf.google.com ~all'],
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'homebridge-mx',
        {
            name: 'homebridge.home.bennettp123.com',
            type: 'MX',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: [
                '1	ASPMX.L.GOOGLE.COM.',
                '5	ALT1.ASPMX.L.GOOGLE.COM.',
                '5	ALT2.ASPMX.L.GOOGLE.COM.',
                '10	ALT3.ASPMX.L.GOOGLE.COM.',
                '10	ALT4.ASPMX.L.GOOGLE.COM.',
            ],
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-dkim',
        {
            name: 'google._domainkey.home.bennettp123.com',
            type: 'TXT',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: [
                txtRecord(
                    'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtS3YmDrHqPgVTWiA8SfCR+NIc2kMvLvSf31mTsrT3m1kGNnn+R7Fxecpl9gnsEiRDA/ElnCNoDJCyjdWzwKn0EcvzTdjvtAWk4pz6tmqK1+aQdRzrmzhYNeFP9biQWq51CmdTVXVB6p1Fr+STsG3/bTe+zubO4iLgNltGslBXEboTeeN6xsbA58ElJDGaG+Iwuw1Wcmia5qpZwKqDO7pSVD8ujBpksgutCSr6N3nBQM90wDQXONm8oAFz6OD/vbR5ljvk2WMuPlOHSWXa4oaP8WlbyGrYJpn1rXzkyiOuSd0wdl3TQ5sssSR0KJsxjzdqFmydhBe1Osyxs+GGeQwtwIDAQAB',
                ),
            ],
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'homebridge-dkim',
        {
            name: 'google._domainkey.homebridge.home.bennettp123.com',
            type: 'TXT',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: [
                txtRecord(
                    'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/mHQw09RPT0UajBcbmCTztXOtqN2fN7zLk1HB0TAGNTg9+l60tyihnvJx/uzxChptfJkLS9A2+idFw7uD4IHzk0oPFId8j4ElJepdNLIEMS1DlBT//HsisNUF2IQbF/56wk/HWoogmKoyBmXCSluTEf4CP61L+zB/apgdsq80sPM+9Dsqk8EJTw6Fnx8ElR6L5AGyeNzyew7n0k2cDhlEkNGMdsM7pHflqOj0+45lStgFREUz+8JSE5OA3gX9kFC/fNRi0FTMYoAWUKhvfM2XTT7VTFrc/RCSb5eT5giqofhwRrwmVso26XKozulBaPWIKtnow1/3kWGEjG39kw7wIDAQAB',
                ),
            ],
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'homebridge-spf',
        {
            name: 'homebridge.home.bennettp123.com',
            type: 'TXT',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 3600,
            records: ['v=spf1 include:_spf.google.com ~all'],
        },
        { deleteBeforeReplace: true },
    )
} else if (mailProvider === 'icloud') {
    // see also TXT apple-domain
    // see also TXT record
    const iCloud = iCloudRecordsForCustomMailDomain({
        name: 'bennettp123.com',
        proofOfDomainOwnership: 'apple-domain=J1zntegtGRFkr4xX',
        createApexTxt: false,
    })

    spf = iCloud.spf
    iCloudProof = iCloud.proofOfDomainOwnership

    iCloudRecordsForCustomMailDomain({
        name: 'home.bennettp123.com',
        proofOfDomainOwnership: 'apple-domain=IhTjpTMY4tZeVzPU',
        dkim: [
            {
                // record is for bennettp123.com, not home.bennettp123.com!
                records: ['sig1.dkim.bennettp123.com.at.icloudmailadmin.com.'],
            },
        ],
    })
}

// TODO import all `bennettp123.com` records
// currently only a subset, the rest are in gitlab.com/bennettp123.com-redux
new aws.route53.Record(
    'txt',
    {
        name: 'bennettp123.com',
        zoneId: zoneId['bennettp123.com'],
        type: 'TXT',
        ttl: 300,
        records: pulumi
            .all([spf?.records, iCloudProof])
            .apply(([spfRecords, iCloudProof]) => [
                'have-i-been-pwned-verification=0bc748e2c70d2194bda98bf27a9c720a',
                'google-site-verification=cNbbo0Ct0uCSQTQSWILfNa_ekmVwaa_-T8cRWwfVr-8',
                'adn_verification=bennettp123 https',
                ...(iCloudProof ? [iCloudProof] : []),
                ...(spfRecords ?? []),
            ]),
        allowOverwrite: true,
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'usg-aaaa',
    {
        name: 'usg.home.bennettp123.com',
        type: 'AAAA',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['2404:bf40:e402:1::1'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'usg-a',
    {
        name: 'usg.home.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['210.10.212.154'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'udm-aaaa',
    {
        name: 'udm.home.bennettp123.com',
        type: 'AAAA',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['2404:bf40:e402:1::1'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'udm-a',
    {
        name: 'udm.home.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['210.10.212.154'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'udm-ext-aaaa',
    {
        name: 'udm-ext.home.bennettp123.com',
        type: 'AAAA',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['2001:c78:1300:1a::2'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'udm-ext-a',
    {
        name: 'udm-ext.home.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['210.10.212.154'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'pihole-aaaa',
    {
        name: 'pihole.home.bennettp123.com',
        type: 'AAAA',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['2404:bf40:e402:20:295d:fce4:c4f6:95ad'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'pihole-a',
    {
        name: 'pihole.home.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['192.168.20.124'],
    },
    {
        deleteBeforeReplace: true,
    },
)

/**
 * I'm not sure why, but NDP just stops working when you enable some
 * combination of debian buster, docker, and tailscale. Let's disable it
 * for now.
 */
const enableHomebridgeIpv6 = false

if (enableHomebridgeIpv6) {
    new aws.route53.Record(
        'homebridge-aaaa',
        {
            name: 'homebridge.home.bennettp123.com',
            type: 'AAAA',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: ['2404:bf40:e402:33:a1e0:5e87:d630:b1ad'],
        },
        {
            deleteBeforeReplace: true,
        },
    )
}

new aws.route53.Record(
    'homebridge-a',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['192.168.33.223'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'miniserver-aaaa',
    {
        name: 'miniserver.dmz.bennettp123.com',
        type: 'AAAA',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['2404:bf40:e402:20:9cca:9436:431a:e6e2'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'miniserver-a',
    {
        name: 'miniserver.dmz.bennettp123.com',
        type: 'A',
        zoneId: zoneId['home.bennettp123.com'],
        ttl: 300,
        records: ['192.168.20.80'],
    },
    {
        deleteBeforeReplace: true,
    },
)

iCloudRecordsForCustomMailDomain({
    name: 'no-vaccine-for-you.com',
    proofOfDomainOwnership: 'apple-domain=372JskH6NEceOEkZ',
})

iCloudRecordsForCustomMailDomain({
    name: 'fukaxe.com',
    proofOfDomainOwnership: 'apple-domain=wJECGuzkGsTpBbvJ',
})
