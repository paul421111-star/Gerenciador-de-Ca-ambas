'use client';
import { useData } from './provider';
import { NAV } from './navigation';
import { Notice } from './ui';
import { Dashboard } from './dashboard';
import { Rentals, Containers, Agenda } from './operations';
import { MapView } from './map-view';
import { Customers, Drivers, Fleet } from './catalogs';
import { Finance, Maintenances, Reports } from './management';
import { Settings, Users, Audit, Account, Help } from './administration';
import { BookingRequests } from './booking-requests';
export function Screen({ section }: {
    section: string;
}) {
    const { data } = useData();
    const item = NAV.find(n => n.path === section);
    if (item?.roles && !item.roles.includes(data.user.role))
        return <Notice tone="warning">Seu perfil não tem acesso a esta seção.</Notice>;
    switch (section) {
        case 'painel': return <Dashboard />;
        case 'solicitacoes': return <BookingRequests />;
        case 'locacoes': return <Rentals />;
        case 'agenda': return <Agenda />;
        case 'minha-rota': return <Agenda mine/>;
        case 'cacambas': return <Containers />;
        case 'mapa': return <MapView />;
        case 'clientes': return <Customers />;
        case 'motoristas': return <Drivers />;
        case 'frota': return <Fleet />;
        case 'financeiro': return <Finance />;
        case 'manutencoes': return <Maintenances />;
        case 'relatorios': return <Reports />;
        case 'usuarios': return <Users />;
        case 'auditoria': return <Audit />;
        case 'configuracoes': return <Settings />;
        case 'conta': return <Account />;
        case 'ajuda': return <Help />;
        default: return null;
    }
}
