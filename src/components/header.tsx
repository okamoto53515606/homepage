'use client';

import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Logo from '@/components/logo';
import { LayoutDashboard, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { Skeleton } from './ui/skeleton';

function UserProfile() {
  const { user, loading, signIn, signOut } = useAuth();
  
  if (loading) {
    return <Skeleton className="h-9 w-9 rounded-full" />;
  }

  if (!user || !user.isLoggedIn) {
    return (
      <Button onClick={signIn} variant="outline">
        <LogIn className="mr-2 h-4 w-4" />
        Googleでログイン
      </Button>
    );
  }

  const roleDisplayNames: Record<string, string> = {
    guest: 'ゲスト',
    free_member: '無料会員',
    paid_member: '有料会員',
    admin: '管理者',
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {user.photoURL && <AvatarImage src={user.photoURL} alt={user.name || ''} />}
            <AvatarFallback>
              {user.name
                ? user.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                : 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {roleDisplayNames[user.role] || user.role}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link href="/admin/generate-article">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>管理パネル</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem>
          <UserIcon className="mr-2 h-4 w-4" />
          <span>プロフィール</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Logo />
            <span className="font-bold font-headline sm:inline-block">
              Homepage
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <UserProfile />
        </div>
      </div>
    </header>
  );
}
