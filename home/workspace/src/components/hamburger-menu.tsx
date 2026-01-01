/**
 * ハンバーガーメニュー（クライアントコンポーネント）
 * 
 * 左側に配置されるサイト内リンク用のメニューです。
 * タグ一覧とトップページへのリンクを含みます。
 */
'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Home, Tag } from 'lucide-react';
import type { TagInfo } from '@/lib/data';

interface HamburgerMenuProps {
  tags: TagInfo[];
}

export default function HamburgerMenu({ tags }: HamburgerMenuProps) {
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
          <hr style={{ margin: '8px 0' }} />
          <div className="dropdown__tag-list">
            {tags.map(tag => (
              <Link key={tag.name} href={`/tags/${tag.name}`} className="dropdown__item dropdown__item--tag" onClick={() => setIsOpen(false)}>
                <span># {tag.name}</span>
                <span className="tag-count">{tag.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}