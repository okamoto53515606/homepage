import Logo from '@/components/logo';

export default function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto flex items-center justify-between px-4 py-6">
        <div className="flex items-center space-x-2">
          <Logo />
          <p className="text-sm font-headline">
            &copy; {new Date().getFullYear()} Homepage. All Rights Reserved.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          現代のための思慮深いコンテンツ。
        </div>
      </div>
    </footer>
  );
}
