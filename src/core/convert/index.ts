import { FORMATS, type FormatId } from '../formats';
import type { BrowserEngine } from '../routes';
import { convertImage } from './image';
import { convertDataText } from './data';
import { convertDocText } from './docs';
import { audioToWav } from './audio';
import { convertBrowserMedia } from './media';

export interface BrowserConvertOptions {
  quality: number; // 0..1
  title?: string;
}

/** Runs a conversion with one of the built-in (Core) browser engines. */
export async function browserConvert(
  engine: BrowserEngine,
  input: Blob,
  from: FormatId,
  to: FormatId,
  opts: BrowserConvertOptions,
): Promise<Blob> {
  const mime = FORMATS[to].mime;
  switch (engine) {
    case 'browser-image':
      return convertImage(input, from, to, opts.quality);
    case 'browser-data':
      return new Blob([convertDataText(await input.text(), from, to)], { type: `${mime};charset=utf-8` });
    case 'browser-doc':
      return new Blob([convertDocText(await input.text(), from, to, opts.title)], { type: `${mime};charset=utf-8` });
    case 'browser-audio':
      return audioToWav(input);
    case 'browser-media':
      return convertBrowserMedia(input, from, to);
  }
}
