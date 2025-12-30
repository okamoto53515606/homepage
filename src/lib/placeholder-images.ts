/**
 * プレースホルダー画像
 * 
 * 記事のサムネイル画像として使用するプレースホルダー画像を管理します。
 * JSONファイルから読み込んだ画像データを提供します。
 */

import data from './placeholder-images.json';

export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
};

export const PlaceHolderImages: ImagePlaceholder[] = data.placeholderImages;
