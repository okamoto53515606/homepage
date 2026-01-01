/**
 * ハンバーガーメニュー（クライアントコンポーネント）
 * 
 * 左側に配置されるサイト内リンク用のメニューです。
 */
'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Home, Tag } from 'lucide-react';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="dropdown" ref={menuRef}>
      <button 
        className="btn-icon" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="メニューを開く"
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div className="dropdown__menu dropdown__menu--left">
          <Link href="/" className="dropdown__item" onClick={() => setIsOpen(false)}>
            <Home size={16} style={{marginRight: '8px'}} />
            トップページ
          </Link>
          <Link href="/tags" className="dropdown__item" onClick={() => setIsOpen(false)}>
            <Tag size={16} style={{marginRight: '8px'}} />
            タグ一覧
          </Link>
        </div>
      )}
    </div>
  );
}
