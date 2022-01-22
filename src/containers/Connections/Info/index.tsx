import classnames from 'classnames'
import { useMemo } from 'react'

import { formatTraffic } from '@lib/helper'
import { BaseComponentProps } from '@models'
import { useI18n } from '@stores'

import { Connection } from '../store'

interface ConnectionsInfoProps extends BaseComponentProps {
    connection: Partial<Connection>
}

export function ConnectionInfo (props: ConnectionsInfoProps) {
    const { translation } = useI18n()
    const t = useMemo(() => translation('Connections').t, [translation])

    return (
        <div className={classnames(props.className, 'text-sm flex flex-col')}>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.id')}</span>
                <span className="font-mono">{props.connection.id}</span>
            </div>
            <div className="flex my-3 justify-between">
                <div className="flex flex-1">
                    <span className="font-bold w-16">{t('info.network')}</span>
                    <span className="font-mono">{props.connection.metadata?.network}</span>
                </div>
                <div className="flex flex-1">
                    <span className="font-bold w-16">{t('info.inbound')}</span>
                    <span className="font-mono">{props.connection.metadata?.type}</span>
                </div>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.host')}</span>
                <span className="font-mono flex-1 break-all">{
                    props.connection.metadata?.host
                        ? `${props.connection.metadata.host}:${props.connection.metadata?.destinationPort}`
                        : t('info.hostEmpty')
                }</span>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.dstIP')}</span>
                <span className="font-mono">{
                    props.connection.metadata?.destinationIP
                        ? `${props.connection.metadata.destinationIP}:${props.connection.metadata?.destinationPort}`
                        : t('info.hostEmpty')
                }</span>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.srcIP')}</span>
                <span className="font-mono">{
                    `${props.connection.metadata?.sourceIP}:${props.connection.metadata?.sourcePort}`
                }</span>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.rule')}</span>
                <span className="font-mono">
                    { props.connection.rule && `${props.connection.rule}${props.connection.rulePayload && `(${props.connection.rulePayload})`}` }
                </span>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.chains')}</span>
                <span className="font-mono flex-1 break-all">
                    { props.connection.chains?.slice().reverse().join(' / ') }
                </span>
            </div>
            <div className="flex my-3 justify-between">
                <div className="flex flex-1">
                    <span className="font-bold w-16">{t('info.upload')}</span>
                    <span className="font-mono">{formatTraffic(props.connection.upload ?? 0)}</span>
                </div>
                <div className="flex flex-1">
                    <span className="font-bold w-16">{t('info.download')}</span>
                    <span className="font-mono">{formatTraffic(props.connection.download ?? 0)}</span>
                </div>
            </div>
            <div className="flex my-3">
                <span className="font-bold w-16">{t('info.status')}</span>
                <span className="font-mono">{
                    !props.connection.completed
                        ? <span className="text-green">{t('info.opening')}</span>
                        : <span className="text-red">{t('info.closed')}</span>
                }</span>
            </div>
        </div>
    )
}
