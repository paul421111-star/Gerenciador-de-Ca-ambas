import type { ReactNode } from 'react';
import { Provider } from '../../components/provider';
import { Shell } from '../../components/shell';
export default function AppLayout({ children }: {
    children: ReactNode;
}) { return <Provider><Shell>{children}</Shell></Provider>; }
