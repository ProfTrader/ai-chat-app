// Minimal, dependency-free .pptx (OOXML) generator.
//
// No zip/pptx library is bundled, so this writes a STORED-method ZIP (no
// compression, hand-rolled CRC32) containing the smallest set of OOXML parts
// PowerPoint needs to open a text-only deck: content types, a presentation,
// one slide master + layout + theme, and one slide per SlideSpec. Slides use
// plain text boxes (no placeholders) so they are fully self-contained.

import {
  CADENCE_LABEL,
  TIER_LABEL,
  formatScheduleDate,
  type AutomationRule,
  type ScheduleEntry,
} from "@/lib/automation/client";
import type { PlanRecord } from "@/lib/plan/client";

export interface SlideSpec {
  title: string;
  bullets: string[];
}

// ---- ZIP (STORED) ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipFile {
  name: string;
  data: Uint8Array;
}

function zipStore(files: ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const concat = (parts: Uint8Array[]) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const part of parts) {
      out.set(part, pos);
      pos += part.length;
    }
    return out;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: stored
      u16(0), // mod time
      u16(0x21), // mod date (1980-01-01)
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra len
      nameBytes,
    ]);
    chunks.push(localHeader, file.data);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0),
      u16(0),
      u16(0),
      u16(0x21),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0), // comment len
      u16(0), // disk start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset),
      nameBytes,
    ]);
    central.push(centralHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...chunks, centralBytes, end]);
}

// ---- OOXML parts -----------------------------------------------------------

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function contentTypes(slideCount: number): string {
  const slideOverrides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverrides}
</Types>`;
}

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

function presentation(slideCount: number): string {
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${ids}</p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function presentationRels(slideCount: number): string {
  const slideRels = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
</Relationships>`;
}

const EMPTY_GRP = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
<p:cSld><p:spTree>${EMPTY_GRP}</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

const slideMasterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree>${EMPTY_GRP}</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

const slideLayoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

function fontScheme() {
  return `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`;
}

const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${A_NS}" name="Nexus">
<a:themeElements>
<a:clrScheme name="Nexus">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="0C1014"/></a:dk2>
<a:lt2><a:srgbClr val="F7FBFF"/></a:lt2>
<a:accent1><a:srgbClr val="03DC5D"/></a:accent1>
<a:accent2><a:srgbClr val="D5A132"/></a:accent2>
<a:accent3><a:srgbClr val="7DD3FC"/></a:accent3>
<a:accent4><a:srgbClr val="FF6B57"/></a:accent4>
<a:accent5><a:srgbClr val="9AA3AD"/></a:accent5>
<a:accent6><a:srgbClr val="132A3A"/></a:accent6>
<a:hlink><a:srgbClr val="03DC5D"/></a:hlink>
<a:folHlink><a:srgbClr val="D5A132"/></a:folHlink>
</a:clrScheme>
${fontScheme()}
<a:fmtScheme name="Office">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;

function slideXml(spec: SlideSpec): string {
  const titlePara = `<a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"><a:solidFill><a:srgbClr val="111318"/></a:solidFill></a:rPr><a:t>${xml(spec.title)}</a:t></a:r></a:p>`;
  const bulletParas = spec.bullets.length
    ? spec.bullets
        .map(
          (line) =>
            `<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800"><a:solidFill><a:srgbClr val="333A45"/></a:solidFill></a:rPr><a:t>${xml(line)}</a:t></a:r></a:p>`,
        )
        .join("")
    : `<a:p><a:endParaRPr lang="en-US"/></a:p>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
<p:cSld><p:spTree>${EMPTY_GRP}
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/>${titlePara}</p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="685800" y="1828800"/><a:ext cx="10820400" cy="4525963"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/>${bulletParas}</p:txBody>
</p:sp>
</p:spTree></p:cSld>
</p:sld>`;
}

// ---- Public API ------------------------------------------------------------

export function planToSlides({
  plan,
  automations,
  schedule,
  firmName,
}: {
  plan: PlanRecord;
  automations: AutomationRule[];
  schedule: ScheduleEntry[];
  firmName?: string;
}): SlideSpec[] {
  const scheduleByStep = new Map(schedule.map((entry) => [entry.stepId, entry]));
  const automationByStep = new Map(automations.map((rule) => [rule.stepId, rule]));
  const generated = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const slides: SlideSpec[] = [
    {
      title: plan.title,
      bullets: [
        plan.summary,
        `${plan.steps.length} steps · ${schedule.length} scheduled`,
        `${firmName ?? "Nexus"} · ${generated}`,
      ],
    },
    {
      title: "Assumptions",
      bullets: plan.assumptions.length
        ? plan.assumptions
        : ["Best-judgment defaults — no explicit assumptions recorded."],
    },
  ];

  plan.steps.forEach((step, index) => {
    const rule = automationByStep.get(step.id);
    const slot = scheduleByStep.get(step.id);
    const bullets: string[] = [];
    if (step.detail) bullets.push(step.detail);
    bullets.push(`Tier: ${TIER_LABEL[step.tier]}`);
    if (slot) bullets.push(`Schedule: ${CADENCE_LABEL[slot.cadence]} · starts ${formatScheduleDate(slot.startDate)}`);
    if (rule) bullets.push(`Automation: ${rule.trigger} → ${rule.action}`);
    slides.push({ title: `Step ${index + 1}: ${step.action}`, bullets });
  });

  slides.push({
    title: "Rollout schedule",
    bullets: schedule.length
      ? schedule.map(
          (entry) =>
            `${entry.title} — ${CADENCE_LABEL[entry.cadence]} · starts ${formatScheduleDate(entry.startDate)}`,
        )
      : ["No scheduled work."],
  });

  slides.push({
    title: "Ready to ship",
    bullets: [
      `${automations.length} automations configured`,
      `${schedule.length} steps scheduled`,
      `Generated by Nexus · ${generated}`,
    ],
  });

  return slides;
}

export function buildPptx(slides: SlideSpec[]): Blob {
  const encoder = new TextEncoder();
  const files: ZipFile[] = [];
  const add = (name: string, content: string) =>
    files.push({ name, data: encoder.encode(content) });

  add("[Content_Types].xml", contentTypes(slides.length));
  add("_rels/.rels", rootRels);
  add("ppt/presentation.xml", presentation(slides.length));
  add("ppt/_rels/presentation.xml.rels", presentationRels(slides.length));
  add("ppt/slideMasters/slideMaster1.xml", slideMaster);
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRels);
  add("ppt/slideLayouts/slideLayout1.xml", slideLayout);
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRels);
  add("ppt/theme/theme1.xml", theme);
  slides.forEach((spec, index) => {
    add(`ppt/slides/slide${index + 1}.xml`, slideXml(spec));
    add(`ppt/slides/_rels/slide${index + 1}.xml.rels`, slideRels);
  });

  const bytes = zipStore(files);
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
