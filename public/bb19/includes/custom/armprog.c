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

// Built twice (see offset-arm.js): as it is, for a project whose columns all have the same rows, and with -DGROUPS (the code marked GROUPS below
// too) for a project with groups of columns that have separate rows, which is a good deal bigger.
// The numbers of the project's rows, put in by the generator in place of these: rows of a line = line * K[0] / 256, the last row K[1],
// whether a line is held to 191 first K[2], whether the groups of columns have separate rows K[3]. Then each group (column byte) has its
// increment and last row in the display memory instead (see G in box), put there when a background is loaded.
static const volatile b8 K[4]={0xA5,0x5A,0xC3,0x3C};

#ifdef GROUPS
// The columns of the groups that have a row r (with separate rows for each group of columns, the last rows are at G in box).
static u valid(volatile b8 *p,u r)
{
  u g,v=0;
  for (g=0;g<4;g++) if (p[1276+g]>=r) v|=0xFF000000u>>(8*g);
  return v;
}
#endif

// One offset over columns x1 to x2 (in order, in the playfield) and rows y1 to y2. grouped: the rows a group has are separate, and a row
// is only offset in the columns of the groups that have it.
static void pass(volatile b8 *p,u dir,u x1,u x2,u y1,u y2,u grouped)
{
  u t,r,e,old,c,pin,mask,hi,lo,left,m;
  int step=1;
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
    m=mask;
#ifdef GROUPS
    if (grouped) m&=valid(p,r);
#endif
    t=conv((old&~m)|(t&m));
    p[r]=t>>24; p[256+r]=t>>16; p[512+r]=t>>8; p[768+r]=t;
    if (r==e) break;
    r+=step;
  }
}

// Alternate columns up and down (dir 6 moves the even columns up and the odd ones down, dir 7 the other way round): a row takes the row below it
// in the columns that go up and the row above it in the others, and the first and last row of the area take each other's.
static void columns(volatile b8 *p,u dir,u x1,u x2,u y1,u y2)
{
  u r,first,cur,prev,next,t,m,up=dir==6?0xAAAAAAAAu:0x55555555u;
  m=(0xFFFFFFFFu>>x1)&(0xFFFFFFFFu<<(31-x2));
  first=cur=load(p,y1);
  prev=load(p,y2);
  for (r=y1;;r++)
  {
    next=r==y2?first:load(p,r+1);
    t=conv((cur&~m)|(((next&up)|(prev&~up))&m));
    p[r]=t>>24; p[256+r]=t>>16; p[512+r]=t>>8; p[768+r]=t;
    if (r==y2) break;
    prev=cur;
    cur=next;
  }
}

static void offset(volatile b8 *p)
{
  u op=CF[0];
  u dir=(op&3)|((op>>1)&4);          // 0 alternate, 1 left, 2 right, 3 up, 4 down, 5 alternate the other way round, 6 alternate columns up and down, 7 down and up
  u x1=CF[1],x2=CF[2],y1=CF[3],y2=CF[4],last=CF[5];   // as the block has them, and the last row of the playfield
  u t;
#ifdef GROUPS
  u g,gx1,gx2,gy2,rows;
#endif
  if (x1>31) x1=31;
  if (x2>31) x2=31;
  if (y1>last) y1=last;
  if (y2>last) y2=last;
  if (x1>x2) { t=x1; x1=x2; x2=t; }
  if (y1>y2) { t=y1; y1=y2; y2=t; }
#ifdef GROUPS
  if (K[3] && (dir==3||dir==4||dir>=6))
  {
    // Up and down: each group of columns turns round in the rows it has.
    for (g=0;g<4;g++)
    {
      gx1=x1>g*8?x1:g*8;
      gx2=x2<g*8+7?x2:g*8+7;
      rows=p[1276+g];
      if (gx1>gx2 || y1>rows) continue;
      gy2=y2>rows?rows:y2;
      if (dir>=6) columns(p,dir,gx1,gx2,y1,gy2);
      else pass(p,dir,gx1,gx2,y1,gy2,0);
    }
    return;
  }
#endif
  if (dir>=6) columns(p,dir,x1,x2,y1,y2);
  else pass(p,dir,x1,x2,y1,y2,K[3]);
}

static u rowof(u line,u inc)
{
  if (K[2] && line>191) line=191;
  return (line*inc)>>8;
}

#ifdef GROUPS
// The first line of a row (found by halving the range).
static u startline(u row,u inc)
{
  u lo=0,hi=255,mid;
  while (lo<hi)
  {
    mid=(lo+hi)>>1;
    if (((mid*inc)>>8)>=row) hi=mid; else lo=mid+1;
  }
  return lo;
}
#endif

// The box test of pf-box.js for a player. C_function[0] = 128 | height, [1] = x, [2] = y, [3] = the sweep (0 for none; bit 7 up, the
// low 5 bits lines) and the width in bits 5 and 6 (0 normal, 1 double, 2 quad). Returns 0 for nothing, 1 for a plain test that hit, and for a sweep the number of the first row with a lit pixel (looking
// down, or up) plus one.
static u box(volatile b8 *p)
{
  u h=CF[0]&127,x=CF[1],y=CF[2],ext=CF[3];
  u e7=ext&31,up=ext>>7,kind=(ext>>5)&3;
  u ofs=kind?15:16,w1=kind==0?7:(kind==1?15:31);
  // Kind 3 is a missile or the ball: its width less one pixel in the fifth byte of the call, and its left edge four pixels further left.
#ifdef GROUPS
  if (kind==3) { ofs=20; w1=CF[4]; }
#endif
  ext&=0x9F;
  u lc,rc,first,last,s,t,bi,lo,hi,mask,r,v,cand,best=0,inc,maxrow;
  if (x>=176 || x+w1<ofs) return 0;
  rc=(x+w1-ofs)>>2;
  if (rc>31) rc=31;
  lc=x>=ofs?(x-ofs)>>2:0;
  if (lc>=32) return 0;
  s=y+h;
  t=s>255?254:(s?s-1:0);                // the bottom line of the box
  for (bi=lc>>3;bi<=(rc>>3);bi++)
  {
    inc=K[0];
    maxrow=K[1];
#ifdef GROUPS
    if (K[3]) { inc=p[1272+bi]; maxrow=p[1276+bi]; }
#endif
    if (!ext)
    {
      first=rowof(y,inc);
      last=rowof(t,inc);
    }
    else if (!up)
    {
      s=t+e7;
      if (s>255) s=255;
      first=rowof(t,inc)+1;
      last=rowof(s,inc);
    }
    else
    {
      s=y+e7;
      if (s>255) s=255;
      first=rowof(y,inc);
      last=rowof(s,inc);
      if (last==0) continue;
      last--;
    }
    if (last>maxrow) last=maxrow;
    if (first>last) continue;
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
        // With separate rows the groups answer in lines (the first line of the row, or the first below it), plus one.
        cand=r+1;
#ifdef GROUPS
        if (K[3])
        {
          cand=startline(up?r+1:r,inc)+1;
          if (cand>255) cand=255;
        }
#endif
        if (!best || (up?cand>best:cand<best)) best=cand;
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
