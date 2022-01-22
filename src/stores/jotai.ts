import { AxiosError } from 'axios'
import produce from 'immer'
import { atom, useAtom } from 'jotai'
import { atomWithImmer } from 'jotai/immer'
import { atomWithStorage, useUpdateAtom } from 'jotai/utils'
import { get } from 'lodash-es'
import { ResultAsync } from 'neverthrow'
import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { Get } from 'type-fest'

import { Language, locales, Lang, getDefaultLanguage } from '@i18n'
import { partition } from '@lib/helper'
import { useWarpImmerSetter, WritableDraft } from '@lib/jotai'
import { isClashX, jsBridge } from '@lib/jsBridge'
import { Snapshot } from '@lib/request'
import * as API from '@lib/request'
import { StreamReader } from '@lib/streamer'
import * as Models from '@models'
import { Log } from '@models/Log'

import { useAPIInfo, useClient } from './request'

export const identityAtom = atom(true)

export const languageAtom = atomWithStorage<Lang | undefined>('language', undefined)

export function useI18n () {
    const [defaultLang, setLang] = useAtom(languageAtom)
    const lang = useMemo(() => defaultLang ?? getDefaultLanguage(), [defaultLang])

    const translation = useCallback(
        function <Namespace extends keyof typeof Language['en_US']>(namespace: Namespace) {
            function t<Path extends string> (path: Path): Get<typeof Language['en_US'][Namespace], Path> {
                return get(Language[lang][namespace], path)
            }
            return { t }
        },
        [lang],
    )

    return { lang, locales, setLang, translation }
}

export const version = atom({
    version: '',
    premium: false,
})

export function useVersion () {
    const [data, set] = useAtom(version)
    const client = useClient()
    const setIdentity = useUpdateAtom(identityAtom)

    useSWR([client], async function () {
        const result = await ResultAsync.fromPromise(client.getVersion(), e => e as AxiosError)
        setIdentity(result.isOk())

        set(
            result.isErr()
                ? { version: '', premium: false }
                : { version: result.value.data.version, premium: !!result.value.data.premium },
        )
    })

    return data
}

export function useRuleProviders () {
    const [{ premium }] = useAtom(version)
    const client = useClient()

    const { data, mutate } = useSWR(['/providers/rule', client, premium], async () => {
        if (!premium) {
            return []
        }

        const ruleProviders = await client.getRuleProviders()

        return Object.keys(ruleProviders.data.providers)
            .map<API.RuleProvider>(name => ruleProviders.data.providers[name])
    })

    return { providers: data ?? [], update: mutate }
}

export const configAtom = atomWithStorage('profile', {
    breakConnections: false,
})

export function useConfig () {
    const [data, set] = useAtom(configAtom)

    const setter = useCallback((f: WritableDraft<typeof data>) => {
        set(produce(data, f))
    }, [data, set])

    return { data, set: useWarpImmerSetter(setter) }
}

export const proxyProvider = atom([] as API.Provider[])

export function useProxyProviders () {
    const [providers, set] = useAtom(proxyProvider)
    const client = useClient()

    const { data, mutate } = useSWR(['/providers/proxy', client], async () => {
        const proxyProviders = await client.getProxyProviders()

        return Object.keys(proxyProviders.data.providers)
            .map<API.Provider>(name => proxyProviders.data.providers[name])
            .filter(pd => pd.name !== 'default')
            .filter(pd => pd.vehicleType !== 'Compatible')
    })

    useEffect(() => { set(data ?? []) }, [data, set])
    return { providers, update: mutate }
}

export function useGeneral () {
    const client = useClient()

    const { data, mutate } = useSWR(['/config', client], async () => {
        const resp = await client.getConfig()
        const data = resp.data
        return {
            port: data.port,
            socksPort: data['socks-port'],
            mixedPort: data['mixed-port'] ?? 0,
            redirPort: data['redir-port'],
            mode: data.mode.toLowerCase() as Models.Data['general']['mode'],
            logLevel: data['log-level'],
            allowLan: data['allow-lan'],
        } as Models.Data['general']
    })

    return { general: data ?? {} as Models.Data['general'], update: mutate }
}

export const proxies = atomWithImmer({
    proxies: [] as API.Proxy[],
    groups: [] as API.Group[],
    global: {
        name: 'GLOBAL',
        type: 'Selector',
        now: '',
        history: [],
        all: [],
    } as API.Group,
})

export function useProxy () {
    const [allProxy, rawSet] = useAtom(proxies)
    const set = useWarpImmerSetter(rawSet)
    const client = useClient()

    const { mutate } = useSWR(['/proxies', client], async () => {
        const allProxies = await client.getProxies()

        const global = allProxies.data.proxies.GLOBAL as API.Group
        // fix missing name
        global.name = 'GLOBAL'

        const policyGroup = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance'])
        const unUsedProxy = new Set(['DIRECT', 'REJECT', 'GLOBAL'])
        const proxies = global.all
            .filter(key => !unUsedProxy.has(key))
            .map(key => ({ ...allProxies.data.proxies[key], name: key }))
        const [proxy, groups] = partition(proxies, proxy => !policyGroup.has(proxy.type))
        set({ proxies: proxy as API.Proxy[], groups: groups as API.Group[], global: global })
    })

    const markProxySelected = useCallback((name: string, selected: string) => {
        set(draft => {
            if (name === 'GLOBAL') {
                draft.global.now = selected
            }
            for (const group of draft.groups) {
                if (group.name === name) {
                    group.now = selected
                }
            }
        })
    }, [set])

    return {
        proxies: allProxy.proxies,
        groups: allProxy.groups,
        global: allProxy.global,
        update: mutate,
        markProxySelected,
        set,
    }
}

export const proxyMapping = atom((get) => {
    const ps = get(proxies)
    const providers = get(proxyProvider)
    const proxyMap = new Map<string, API.Proxy>()
    for (const p of ps.proxies) {
        proxyMap.set(p.name, p)
    }

    for (const provider of providers) {
        for (const p of provider.proxies) {
            proxyMap.set(p.name, p as API.Proxy)
        }
    }

    return proxyMap
})

export function useClashXData () {
    const { data, mutate } = useSWR('/clashx', async () => {
        if (!isClashX()) {
            return {
                isClashX: false,
                startAtLogin: false,
                systemProxy: false,
            }
        }

        const startAtLogin = await jsBridge?.getStartAtLogin() ?? false
        const systemProxy = await jsBridge?.isSystemProxySet() ?? false

        return { startAtLogin, systemProxy, isClashX: true }
    })

    return { data, update: mutate }
}

export const rules = atomWithImmer([] as API.Rule[])

export function useRule () {
    const [data, rawSet] = useAtom(rules)
    const set = useWarpImmerSetter(rawSet)
    const client = useClient()

    async function update () {
        const resp = await client.getRules()
        set(resp.data.rules)
    }

    return { rules: data, update }
}

const logsAtom = atom({
    key: '',
    instance: null as StreamReader<Log> | null,
})

export function useLogsStreamReader () {
    const apiInfo = useAPIInfo()
    const { general } = useGeneral()
    const version = useVersion()
    const [item, setItem] = useAtom(logsAtom)

    if (!version.version || !general.logLevel) {
        return null
    }

    const useWebsocket = !!version.version || true
    const key = `${apiInfo.protocol}//${apiInfo.hostname}:${apiInfo.port}/logs?level=${general.logLevel ?? ''}&useWebsocket=${useWebsocket}&secret=${apiInfo.secret}`
    if (item.key === key) {
        return item.instance!
    }

    const oldInstance = item.instance

    const logUrl = `${apiInfo.protocol}//${apiInfo.hostname}:${apiInfo.port}/logs?level=${general.logLevel ?? ''}`
    const instance = new StreamReader<Log>({ url: logUrl, bufferLength: 200, token: apiInfo.secret, useWebsocket })
    setItem({ key, instance })

    if (oldInstance != null) {
        oldInstance.destory()
    }

    return instance
}

export function useConnectionStreamReader () {
    const apiInfo = useAPIInfo()
    const version = useVersion()

    const useWebsocket = !!version.version || true

    const url = `${apiInfo.protocol}//${apiInfo.hostname}:${apiInfo.port}/connections`
    return useMemo(
        () => version.version ? new StreamReader<Snapshot>({ url, bufferLength: 200, token: apiInfo.secret, useWebsocket }) : null,
        [apiInfo.secret, url, useWebsocket, version.version],
    )
}
