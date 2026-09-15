import type { Metadata } from 'next';
import { Login } from '../../components/login';
export const metadata: Metadata = { title: 'Acesso ao sistema' };
export default function LoginPage() { return <Login />; }
