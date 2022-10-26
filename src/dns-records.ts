import * as aws from '@pulumi/aws'

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

new aws.route53.Record(
    'usg-aaaa',
    {
        name: 'usg.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
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
        zoneId: 'Z1LNE5PQ9LO13V',
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
        name: 'usg.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
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
        name: 'usg.home.bennettp123.com',
        type: 'A',
        zoneId: 'Z1LNE5PQ9LO13V',
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
        name: 'usg.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['2404:bf40:e402:1::1'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'udm-ext-a',
    {
        name: 'usg.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['2001:c78:1300:1a::2'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-aaaa',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['2404:bf40:e402:33:586a:d587:9e99:4252'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-a',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'A',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['192.168.33.127'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'home-mx',
    {
        name: 'home.bennettp123.com',
        type: 'MX',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            '1	ASPMX.L.GOOGLE.COM.',
            '5	ALT1.ASPMX.L.GOOGLE.COM.',
            '5	ALT2.ASPMX.L.GOOGLE.COM.',
            '10	ALT3.ASPMX.L.GOOGLE.COM.',
            '10	ALT4.ASPMX.L.GOOGLE.COM.',
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-mx',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'MX',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            '1	ASPMX.L.GOOGLE.COM.',
            '5	ALT1.ASPMX.L.GOOGLE.COM.',
            '5	ALT2.ASPMX.L.GOOGLE.COM.',
            '10	ALT3.ASPMX.L.GOOGLE.COM.',
            '10	ALT4.ASPMX.L.GOOGLE.COM.',
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'home-dkim',
    {
        name: 'google._domainkey.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            txtRecord(
                'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtS3YmDrHqPgVTWiA8SfCR+NIc2kMvLvSf31mTsrT3m1kGNnn+R7Fxecpl9gnsEiRDA/ElnCNoDJCyjdWzwKn0EcvzTdjvtAWk4pz6tmqK1+aQdRzrmzhYNeFP9biQWq51CmdTVXVB6p1Fr+STsG3/bTe+zubO4iLgNltGslBXEboTeeN6xsbA58ElJDGaG+Iwuw1Wcmia5qpZwKqDO7pSVD8ujBpksgutCSr6N3nBQM90wDQXONm8oAFz6OD/vbR5ljvk2WMuPlOHSWXa4oaP8WlbyGrYJpn1rXzkyiOuSd0wdl3TQ5sssSR0KJsxjzdqFmydhBe1Osyxs+GGeQwtwIDAQAB',
            ),
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'home-spf',
    {
        name: 'home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 3600,
        records: ['v=spf1 include:_spf.google.com ~all'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-dkim',
    {
        name: 'google._domainkey.homebridge.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            txtRecord(
                'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/mHQw09RPT0UajBcbmCTztXOtqN2fN7zLk1HB0TAGNTg9+l60tyihnvJx/uzxChptfJkLS9A2+idFw7uD4IHzk0oPFId8j4ElJepdNLIEMS1DlBT//HsisNUF2IQbF/56wk/HWoogmKoyBmXCSluTEf4CP61L+zB/apgdsq80sPM+9Dsqk8EJTw6Fnx8ElR6L5AGyeNzyew7n0k2cDhlEkNGMdsM7pHflqOj0+45lStgFREUz+8JSE5OA3gX9kFC/fNRi0FTMYoAWUKhvfM2XTT7VTFrc/RCSb5eT5giqofhwRrwmVso26XKozulBaPWIKtnow1/3kWGEjG39kw7wIDAQAB',
            ),
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-spf',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 3600,
        records: ['v=spf1 include:_spf.google.com ~all'],
    },
    {
        deleteBeforeReplace: true,
    },
)
