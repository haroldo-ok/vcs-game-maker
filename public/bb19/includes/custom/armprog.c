// Playfield offset and playfield box test for the coprocessor (DPC+). Position independent and self-contained: it is placed in the ROM as data and called through a
// pointer. p = column 0 of the playfield (the other columns follow 256 bytes apart). The block's numbers are in the function bytes.
typedef unsigned int u;
typedef unsigned char b8;
#define CF ((volatile b8*)0x40000DA4)

// A row as 32 columns, the first the top bit. Bytes 1 and 3 of a row hold their columns the other way round: swap them (and back).
static u conv(u v)
{
  u x=v;
  x=((x>>1)&0x55555555)|((x&0x55555555)<<1);
  x=((x>>2)&0x33333333)|((x&0x33333333)<<2);
  x=((x>>4)&0x0F0F0F0F)|((x&0x0F0F0F0F)<<4);
  return (x&0x00FF00FF)|(v&0xFF00FF00);
}

static u load(volatile b8 *p,u r)
{
  return conv((p[r]<<24)|(p[256+r]<<16)|(p[512+r]<<8)|p[768+r]);
}

static void offset(volatile b8 *p)
{
  u op=CF[0];
  u dir=(op&3)|((op>>1)&4);          // 0 alternate, 1 left, 2 right, 3 up, 4 down, 5 alternate the other way round
  u w=(CF[1]<<16)|(CF[2]<<8)|CF[3];  // x1 5 bits, x2 5, y1 7, y2 7
  u x1=w>>19,x2=(w>>14)&31,y1=(w>>7)&127,y2=w&127;
  u t,r,e,old,c,pin,mask,hi,lo,left;
  int step=1;
  if (x1>x2) { t=x1; x1=x2; x2=t; }
  if (y1>y2) { t=y1; y1=y2; y2=t; }
  mask=(0xFFFFFFFFu>>x1)&(0xFFFFFFFFu<<(31-x2));
  hi=0x80000000u>>x1;
  lo=1u<<(31-x2);
  r=y1;
  e=y2;
  if (dir==1||dir==3) { step=-1; r=y2; e=y1; }
  old=load(p,e);
  c=old;                              // vertical: the row that comes in first
  left=dir==1||(dir==0&&!(e&1))||(dir==5&&(e&1));
  pin=old&(left?hi:lo);               // horizontal: the pixel that comes in first
  for (;;)
  {
    old=load(p,r);
    if (dir==3||dir==4) { t=c; c=old; }
    else
    {
      left=dir==1||(dir==0&&!(r&1))||(dir==5&&(r&1));
      if (left) { t=((old<<1)&~lo)|(pin?lo:0); pin=old&hi; }
      else { t=((old>>1)&~hi)|(pin?hi:0); pin=old&lo; }
    }
    t=conv((old&~mask)|(t&mask));
    p[r]=t>>24; p[256+r]=t>>16; p[512+r]=t>>8; p[768+r]=t;
    if (r==e) break;
    r+=step;
  }
}

// The numbers of the project's rows, put in by the generator in place of these: rows of a line = line * K[0] / 256, the last row K[1],
// whether a line is held to 191 first K[2].
static const volatile b8 K[4]={0xA5,0x5A,0xC3,0x3C};

static u rowof(u line)
{
  if (K[2] && line>191) line=191;
  return (line*K[0])>>8;
}

// The box test of pf-box.js for a player. C_function[0] = 128 | height, [1] = x, [2] = y, [3] = the sweep (0 for none; bit 7 up, the
// low 5 bits lines) and the width in bits 5 and 6 (0 normal, 1 double, 2 quad). Returns 0 for nothing, 1 for a plain test that hit, and for a sweep the number of the first row with a lit pixel (looking
// down, or up) plus one.
static u box(volatile b8 *p)
{
  u h=CF[0]&127,x=CF[1],y=CF[2],ext=CF[3];
  u e7=ext&31,up=ext>>7,kind=(ext>>5)&3;
  u ofs=kind?15:16,w1=kind==0?7:(kind==1?15:31);
  ext&=0x9F;
  u lc,rc,first,last,s,t,bi,lo,hi,mask,r,v,best=0,maxrow=K[1];
  if (x>=176 || x+w1<ofs) return 0;
  rc=(x+w1-ofs)>>2;
  if (rc>31) rc=31;
  lc=x>=ofs?(x-ofs)>>2:0;
  if (lc>=32) return 0;
  s=y+h;
  t=s>255?254:(s?s-1:0);                // the bottom line of the box
  if (!ext)
  {
    first=rowof(y);
    last=rowof(t);
  }
  else if (!up)
  {
    s=t+e7;
    if (s>255) s=255;
    first=rowof(t)+1;
    last=rowof(s);
  }
  else
  {
    s=y+e7;
    if (s>255) s=255;
    first=rowof(y);
    last=rowof(s);
    if (last==0) return 0;
    last--;
  }
  if (last>maxrow) last=maxrow;
  if (first>last) return 0;
  for (bi=lc>>3;bi<=(rc>>3);bi++)
  {
    lo=lc>bi*8?lc-bi*8:0;
    hi=rc-bi*8>=8?7:rc-bi*8;
    mask=bi&1?(0xFF<<lo)&(0xFF>>(7-hi)):(0xFF>>lo)&(0xFF<<(7-hi));
    mask&=0xFF;
    for (r=up?last:first;;)
    {
      v=p[bi*256+r]&mask;
      if (v)
      {
        if (!ext) return 1;
        if (!best || (up?r+1>best:r+1<best)) best=r+1;
        break;
      }
      if (up) { if (r==first) break; r--; }
      else { if (r==last) break; r++; }
    }
  }
  return best;
}

void __attribute__((section(".text.entry"))) run(void)
{
  // The first column of the playfield: the address the kernel's first data fetcher has, in display memory (get32bitdff(0) of main.c).
  const b8 *fa=(const b8 *)(0xC00+*(volatile unsigned short *)(0xC00+0x61A0));
  volatile b8 *p=(volatile b8 *)(0x40000C00+(fa[46]<<8)+fa[38]);
  if (CF[0]&0x80) CF[1]=box(p);
  else offset(p);
}
