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

const zoneId = {
    'bennettp123.com': 'Z36Q6VQY8AKSB2',
    'home.bennettp123.com': 'Z1LNE5PQ9LO13V',
}

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
    new aws.route53.Record(
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

    new aws.route53.Record(
        'mx',
        {
            name: 'bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'MX',
            ttl: 300,
            records: ['10 mx01.mail.icloud.com.', '10 mx02.mail.icloud.com.'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    // see also TXT record
    new aws.route53.Record(
        'spf',
        {
            name: 'bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'SPF',
            ttl: 300,
            records: ['v=spf1 include:icloud.com ~all'],
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
        'icloud-dkim',
        {
            name: 'sig1._domainkey.bennettp123.com',
            zoneId: zoneId['bennettp123.com'],
            type: 'CNAME',
            ttl: 300,
            records: ['sig1.dkim.bennettp123.com.at.icloudmailadmin.com.'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-mx',
        {
            name: 'home.bennettp123.com',
            zoneId: zoneId['home.bennettp123.com'],
            type: 'MX',
            ttl: 300,
            records: ['10 mx01.mail.icloud.com.', '10 mx02.mail.icloud.com.'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-spf',
        {
            name: 'home.bennettp123.com',
            type: 'SPF',
            zoneId: zoneId['home.bennettp123.com'],
            ttl: 300,
            records: ['v=spf1 include:icloud.com ~all'],
            allowOverwrite: true,
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
            records: [
                'apple-domain=IhTjpTMY4tZeVzPU',
                'v=spf1 include:icloud.com ~all',
            ],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )

    new aws.route53.Record(
        'home-dkim',
        {
            name: 'sig1._domainkey.home.bennettp123.com',
            zoneId: zoneId['home.bennettp123.com'],
            type: 'CNAME',
            ttl: 300,
            records: ['sig1.dkim.bennettp123.com.at.icloudmailadmin.com.'],
            allowOverwrite: true,
        },
        { deleteBeforeReplace: true },
    )
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
        records: [
            'have-i-been-pwned-verification=0bc748e2c70d2194bda98bf27a9c720a',
            'google-site-verification=cNbbo0Ct0uCSQTQSWILfNa_ekmVwaa_-T8cRWwfVr-8',
            'adn_verification=bennettp123 https',
            'apple-domain=J1zntegtGRFkr4xX',
            ...(mailProvider === 'gmail'
                ? ['v=spf1 include:_spf.google.com ~all']
                : []),
            ...(mailProvider === 'icloud'
                ? ['v=spf1 include:icloud.com ~all']
                : []),
        ],
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
    'homebridge-cname',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'CNAME',
        zoneId: zoneId['home.bennettp123.com'],
        records: ['homebridge.tailc56a3.ts.net.'],
    },
    {
        aliases: [{ name: 'homebridge-a' }, { name: 'homebridge-aaaa' }],
        deleteBeforeReplace: true,
    },
)
