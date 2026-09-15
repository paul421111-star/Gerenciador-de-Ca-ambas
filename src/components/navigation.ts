import type { IconName } from './icons';
export const NAV: {
    path: string;
    label: string;
    icon: IconName;
    group: string;
    roles?: string[];
}[] = [
    { path: 'painel', label: 'Visão geral', icon: 'dashboard', group: 'OPERAÇÃO' },
    { path: 'locacoes', label: 'Locações', icon: 'bin', group: 'OPERAÇÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'agenda', label: 'Agenda de serviços', icon: 'calendar', group: 'OPERAÇÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'minha-rota', label: 'Meus serviços', icon: 'route', group: 'OPERAÇÃO', roles: ['DRIVER'] },
    { path: 'cacambas', label: 'Controle de caçambas', icon: 'bin', group: 'OPERAÇÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'mapa', label: 'Distribuição no mapa', icon: 'pin', group: 'OPERAÇÃO' },
    { path: 'clientes', label: 'Clientes', icon: 'users', group: 'CADASTROS', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'motoristas', label: 'Motoristas', icon: 'driver', group: 'CADASTROS', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'frota', label: 'Frota de caminhões', icon: 'truck', group: 'CADASTROS', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'financeiro', label: 'Recebimentos', icon: 'wallet', group: 'GESTÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'manutencoes', label: 'Manutenções', icon: 'tool', group: 'GESTÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'relatorios', label: 'Relatórios', icon: 'chart', group: 'GESTÃO', roles: ['ADMIN', 'DISPATCHER'] },
    { path: 'usuarios', label: 'Usuários e acessos', icon: 'shield', group: 'SISTEMA', roles: ['ADMIN'] },
    { path: 'auditoria', label: 'Histórico de ações', icon: 'history', group: 'SISTEMA', roles: ['ADMIN'] },
    { path: 'configuracoes', label: 'Configurações', icon: 'settings', group: 'SISTEMA', roles: ['ADMIN'] },
    { path: 'conta', label: 'Minha conta', icon: 'lock', group: 'SISTEMA' },
    { path: 'ajuda', label: 'Guia de operação', icon: 'help', group: 'SISTEMA' }
];
