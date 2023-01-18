import * as ipaddr from 'ipaddr.js'

export function isIPv6(o: unknown): o is ipaddr.IPv6 {
    if (!isIP(o)) {
        return false
    }

    return o.kind() === 'ipv6'
}

export function isIPv4(o: unknown): o is ipaddr.IPv4 {
    if (!isIP(o)) {
        return false
    }

    return o.kind() === 'ipv4'
}

export function isIP(o: unknown): o is ipaddr.IPv4 | ipaddr.IPv6 {
    if (o === undefined) {
        return false
    }
    if (o === null) {
        return false
    }
    if (typeof o !== 'object') {
        return false
    }
    if (!('kind' in o)) {
        return false
    }
    if (typeof o.kind !== 'function') {
        return false
    }
    return true
}
