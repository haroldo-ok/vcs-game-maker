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

// Built in a program for each set of functions a project needs (see offset-arm.js and the files of the prog folder): with and without -DGROUPS, and with any of the five sets of functions left out: -DNOOFFSET (the Playfield offset block), -DNOBOX (the playfield box test), -DNOCIRCLE (the circle block), -DNOPIX (the pixel finding and the bounce of the ball and the missiles) and -DNOFIRE (the movement of an object a Fire block launched with the playfield check on)
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
  // Kind 3 is a missile or the ball: its width less one pixel in the fifth byte of the call, and the column offset (x less it over 4 is the column: 17 for the
  // ball, 14 for a missile, measured against the hardware flag) in the sixth.
#ifdef GROUPS
  if (kind==3) { ofs=CF[5]; w1=CF[4]; }
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

#ifndef NOCIRCLE
// "Playfield set/clear/flip circle" (function 96 plus the operation: 0 set, 1 clear, 2 flip). C_function[1..8]: the center column and row, the radius
// (15 at most), the padding of the left, right, top and bottom (15 at most: the columns and rows at the edges the block leaves alone) and the last row
// of the playfield. A row of the circle is as wide as the biggest d with d * d <= r * r less the square of the row's distance from the center.
static void circle(volatile b8 *p)
{
  int op=CF[0]&3,cx=CF[1],cy=CF[2],r=CF[3],pl=CF[4],pr=CF[5],pt=CF[6],pb=CF[7],last=CF[8];
  int lo,hi,top,bot,d,y,v,h,x1,x2,bi,a,b;
  u m;
  if (r>15) r=15;
  if (pl>15) pl=15;
  if (pr>15) pr=15;
  if (pt>15) pt=15;
  if (pb>15) pb=15;
  lo=pl;
  hi=31-pr;
  top=pt;
  bot=last-pb;
  if (lo>hi||top>bot) return;
  for (d=-r;d<=r;d++)
  {
    y=cy+d;
    if (y<top||y>bot) continue;
    v=r*r-d*d;
    for (h=0;(h+1)*(h+1)<=v;h++);
    x1=cx-h;
    x2=cx+h;
    if (x1<lo) x1=lo;
    if (x2>hi) x2=hi;
    for (bi=x1>>3;bi<=(x2>>3);bi++)
    {
#ifdef GROUPS
      if (K[3] && y>p[1276+bi]) continue;
#endif
      // The columns of the circle in this byte of the row (the odd bytes of a row hold their columns the other way round).
      a=x1>bi*8?x1-bi*8:0;
      b=x2-bi*8>=8?7:x2-bi*8;
      m=bi&1?(0xFF<<a)&(0xFF>>(7-b)):(0xFF>>a)&(0xFF<<(7-b));
      m&=0xFF;
      if (op==0) p[bi*256+y]|=m;
      else if (op==1) p[bi*256+y]&=~m;
      else p[bi*256+y]^=m;
    }
  }
}

#endif

#if !defined(NOPIX) || !defined(NOFIRE)
// A playfield pixel as the 6502's pfread has it: column c is in byte c / 8 of its row, the odd bytes with their columns the other way round.
static u pixel(volatile b8 *p,u c,u r)
{
  u bi=c>>3;
  u m=(bi&1)?(1u<<(c&7)):(0x80u>>(c&7));
  return (p[bi*256+r]&m)!=0;
}
#endif

#ifndef NOPIX
// The playfield pixel the ball or a missile has touched (the "Find playfield pixel collided with" block's routine of generators/bbasic/background.js) and
// the direction it turns to on a bounce (the shared reflect routine of object_bounce in generators/bbasic/sprites.js), worked out here instead of
// by the 6502 (about 350 and 900 cycles). The playfield is read the way the 6502's pfread does: column c is in byte c / 8 of its row, the odd bytes
// with their columns the other way round. All the arithmetic is in bytes, as the 6502's is (an x less than the offset wraps round and is held to 31).

// The horizontal (1 right, 2 left) and the vertical (1 down, 2 up) step of each of the 16 directions, and of the 8 of a Fire block without 16 directions.
static const b8 XSTEP16[16]={0,1,1,1,1,1,1,1,0,2,2,2,2,2,2,2};
static const b8 YSTEP16[16]={2,2,2,2,0,1,1,1,1,1,1,1,0,2,2,2};
static const b8 XSTEP8[8]={0,1,1,1,0,2,2,2};
static const b8 YSTEP8[8]={2,2,0,1,1,1,0,2};

static u xstep(u dir,u steps) { return dir>=steps?0:(steps==16?XSTEP16[dir]:XSTEP8[dir]); }
static u ystep(u dir,u steps) { return dir>=steps?0:(steps==16?YSTEP16[dir]:YSTEP8[dir]); }
static u more(u v,u last) { return v<last?v+1:v; }
static u less(u v) { return v>0?v-1:v; }

// C_function[1..9]: x, the top line, the height in lines (0 for none), the size bits ($30 mask), the direction, 8 or 16 directions, the last row,
// the column offset (x less this over 4 is the column), the row increment (a line * it / 256 is the row). Gives back the column and the row in [1] and [2].
static void findpixel(volatile b8 *p)
{
  u x=CF[1],top=CF[2],height=CF[3],size=CF[4]&0x30,dir=CF[5],steps=CF[6],maxrow=CF[7],off=CF[8],inc=CF[9];
  u xs=xstep(dir,steps),ys=ystep(dir,steps);
  u col,right,row,bottom,cb,rb,w,t;
  col=((x-off)&255)>>2;
  if (col>31) col=31;
  w=size==0?0:(size==0x10?1:(size==0x20?3:7));
  right=(((x-off)+w)&255)>>2;
  if (right>31) right=31;
  row=((top&255)*inc)>>8;
  if (row>maxrow) row=maxrow;
  bottom=row;
  if (height)
  {
    t=(((top+height-1)&255)*inc)>>8;
    bottom=t>maxrow?maxrow:t;
    if (bottom<row) bottom=row;
  }
  if (xs==1) cb=more(right,31);
  else if (xs==2) cb=less(col);
  else cb=col;
  if (ys==1) rb=more(bottom,maxrow);
  else if (ys==2) rb=less(row);
  else rb=row;
  {
    // The cells in the order they are looked at: the first lit one is the answer, and when none is, the one ahead.
    u cs[8],rs[8],i;
    cs[0]=col; cs[1]=right; cs[2]=col; cs[3]=right; cs[4]=col; cs[5]=right; cs[6]=cb; cs[7]=cb;
    rs[0]=row; rs[1]=row; rs[2]=bottom; rs[3]=bottom; rs[4]=rb; rs[5]=rb; rs[6]=row; rs[7]=bottom;
    for (i=0;i<8;i++) if (pixel(p,cs[i],rs[i])) break;
    col=i<8?cs[i]:cb;
    row=i<8?rs[i]:rb;
  }
  CF[1]=col;
  CF[2]=row;
}

// The whole of a Bounce block's frame (the stage code of object_bounce in generators/bbasic/sprites.js, with the reflect routine in it) for an object with a Fire
// heading: C_function[1..10]: x, the top line, the direction, 8 or 16 directions, the last row, the column offset, the row increment, the stage byte, 1 for an object with Gravity and its fall speed. Gives back the
// direction and the stage byte in [1] and [2]. The first frame of a bounce turns the heading from the pixels around the cell the object is in: a straight vertical
// heading flips the vertical, a straight horizontal one the horizontal, a diagonal one looks at the cells (stepping back out of the wall first when it is inside it)
// and flips what they say was hit. The next ones wait, and the fourth gives up on the new heading and turns the old one right round.
static void bouncepix(volatile b8 *p)
{
  u x=CF[1],top=CF[2],dir=CF[3],steps=CF[4],maxrow=CF[5],off=CF[6],inc=CF[7],stage=CF[8];
  u half=steps>>1,col,row,t,xs,ys,left,up,mostly_y,flip,bcol,brow,mark=stage&48,grav=CF[9],gsp=CF[10];
  stage|=64;
  if (mark==16) { CF[1]=dir; CF[2]=(stage&207)|32; return; }
  if (mark==32) { CF[1]=dir; CF[2]=(stage&207)|48; return; }
  if (mark==48)
  {
    dir=(stage&15)+half;
    if (dir>=steps) dir-=steps;
    CF[1]=dir;
    CF[2]=(stage&207)|48;
    return;
  }
  stage=(dir&15)|64;
  xs=xstep(dir,steps);
  ys=ystep(dir,steps);
  // An object with Gravity (grav 1, its fall speed in gsp): the fall speed gives the vertical way (a heading that goes up or down and along x met what gravity brought it
  // down onto, and one along x only is falling, or rising, too); a fall speed of 0 keeps the heading's way, or is down.
  if (grav && xs && dir<steps) { if (gsp>127) ys=2; else if (gsp || !ys) ys=1; }
  left=xs==2;
  up=ys==2;
  if (dir>=steps) flip=3;
  else if (!xs) flip=2;
  else if (!ys) flip=1;
  else
  {
    mostly_y=steps==16 && (dir==1||dir==7||dir==9||dir==15);
    col=((x-off)&255)>>2;
    if (col>31) col=31;
    row=((top&255)*inc)>>8;
    if (row>maxrow) row=maxrow;
    if (pixel(p,col,row))
    {
      // Inside a wall: the base is the cell just outside it, found by stepping back along the axis the object came in on.
      bcol=left?more(col,31):less(col);
      brow=up?more(row,maxrow):less(row);
      {
        // The pixel one step back along the heading says which way it came in: only the column changed, along x; only the row, along y.
        u cx=(((x-off)&3)==(left?3:0));
        if (cx) mostly_y=0;
      }
      if (mostly_y)
      {
        if (!pixel(p,col,brow)) row=brow;
        else if (!pixel(p,bcol,row)) col=bcol;
        else { col=bcol; row=brow; }
      }
      else
      {
        if (!pixel(p,bcol,row)) col=bcol;
        else if (!pixel(p,col,brow)) row=brow;
        else { col=bcol; row=brow; }
      }
    }
    // The pixel beside the base cell along x (A) and the one beside it along y (B) say what was hit.
    bcol=left?less(col):more(col,31);
    brow=up?less(row):more(row,maxrow);
    if (pixel(p,bcol,row)) flip=pixel(p,col,brow)?3:1;
    else flip=pixel(p,col,brow)?2:3;
  }
  if (flip==1) { t=steps-dir; dir=t==steps?0:t; }
  else if (flip==2) dir=dir>half?steps+half-dir:half-dir;
  else if (flip==3) { dir+=half; if (dir>=steps) dir-=steps; }
  CF[1]=dir;
  // Bit 7 asks the 6502 for the bounce of the fall speed (the vertical way was turned).
  CF[2]=(stage&207)|16|((grav && flip>1)?128:0);
}
#endif

#ifndef NOFIRE
// The movement of an object a Fire block launched, for one frame (the "missilefire" code of generateMissileFireChecks in generators/bbasic/sprites.js, which
// the 6502 does when this is not in the program): C_function[1..10]: x, y, the direction, the speed, the sixteenths kept (the halfway directions), the flags
// (bit 0: 16 directions, bit 1: checks the playfield while it moves, bits 2 and 3: the top line is y + 1 (1) or y - 1 (2) for the cell it is in), the stage
// byte of the Bounce (given back as it is), the column offset, the last
// row, the row increment. Gives back x, y, the sixteenths kept and the stage byte in [1] to [4].
// (Each step plus 2, for the tables are bytes: the coprocessor emulators have no signed loads.)
static const b8 DX16[16]={2,3,3,4,3,4,3,3,2,1,1,0,1,0,1,1};
static const b8 DY16[16]={1,0,1,1,2,3,3,4,3,4,3,3,2,1,1,0};
static const b8 DX8[8]={2,3,3,3,2,1,1,1};
static const b8 DY8[8]={1,1,2,3,3,3,2,1};

// Whether the cell an object at x, y is in is lit (the numbers of the call are in the bytes of the call).
// 0 for a clear cell (or none), else 1 + a number of the lit cell: its column xor 8 times its row (different for neighbouring cells).
static u lit(volatile b8 *p,u x,u y)
{
  u fl=CF[6],shift=(fl&4)?1:((fl&8)?255:0),col=((x-CF[8])&255)>>2,row=(((y+shift)&255)*CF[10])>>8;
  if (col>31 || row>CF[9]) return 0;
  return pixel(p,col,row)?1+((col^(row<<3))&255):0;
}

static void firemove(volatile b8 *p)
{
  u x=CF[1],y=CF[2],dir=CF[3],speed=CF[4],frac=CF[5],fl=CF[6],stage=CF[7],steps=(fl&1)?16:8;
  u t3=speed,t4=speed,t5=0,n,start=0,cell;
  int dx=0,dy=0,ax,ay,sx,sy,px,py,mx,my;
  if (dir<steps) { dx=(int)((fl&1)?DX16[dir]:DX8[dir])-2; dy=(int)((fl&1)?DY16[dir]:DY8[dir])-2; }
  ax=dx<0?-dx:dx;
  ay=dy<0?-dy:dy;
  sx=dx>0?1:(dx<0?-1:0);
  sy=dy>0?1:(dy<0?-1:0);
  if ((fl&1) && (dir&1))
  {
    t3=speed*5+(frac&15);
    t4=speed*9+(frac>>4);
    frac=(t3&15)|((t4&15)<<4);
    t3=(t3>>4)+speed;
    t4=t4>>4;
  }
  if (!(fl&2))
  {
    // One move along each axis: the main axis of a halfway direction by t3, its other by t4, the others by the speed.
    x+=sx*(ax==2?t3:(((fl&1)&&ay==2)?t4:speed));
    y+=sy*(ay==2?t3:(((fl&1)&&ax==2)?t4:speed));
  }
  else
  {
    // A step at a time: the main axis (or both) one pixel, and on a halfway direction the other axis now and then (t4 pixels in t3 steps).
    mx=(ax==1&&ay==2)?sx:0;
    my=(ay==1&&ax==2)?sy:0;
    px=mx?0:sx;
    py=my?0:sy;
    stage&=127;
    // An object that starts inside a lit cell is stopped by any other lit cell it comes to, not by the one it is in.
    start=lit(p,x,y);
    n=t3;
    do
    {
      u moved=0;
      x+=px;
      y+=py;
      if ((fl&1) && (dir&1))
      {
        // (A step into another lit cell than the one the object started in is taken back: it stays where it was.)
        if ((cell=lit(p,x,y)) && (!start || (cell!=start && !((stage&0x30)==0x30 && (dir&15)!=(stage&15))) || (cell==start && !(stage&0x30)))) { if (!start) stage&=207; if (start && cell!=start) { x-=px; y-=py; } break; }
        t5+=t4;
        if (t5>=t3) { t5-=t3; x+=mx; y+=my; moved=1; }
        else goto next;
      }
      if ((cell=lit(p,x,y)) && (!start || (cell!=start && !((stage&0x30)==0x30 && (dir&15)!=(stage&15))) || (cell==start && !(stage&0x30))))
      {
        if (!start) stage&=207;
        if (start && cell!=start) { if (moved) { x-=mx; y-=my; } else { x-=px; y-=py; } }
        break;
      }
next:
      n--;
    } while (n>0);
  }
  CF[1]=x;
  CF[2]=y;
  CF[3]=frac;
  CF[4]=stage;
}
#endif

void __attribute__((section(".text.entry"))) run(void)
{
  // The first column of the playfield: the address the kernel's first data fetcher has, in display memory (get32bitdff(0) of main.c).
  const b8 *fa=(const b8 *)(0xC00+*(volatile unsigned short *)(0xC00+0x61A0));
  volatile b8 *p=(volatile b8 *)(0x40000C00+(fa[46]<<8)+fa[38]);
  u op=CF[0];
  if (op&0x80)
  {
#ifndef NOBOX
    CF[1]=box(p);
#endif
  }
#ifndef NOCIRCLE
  else if (op>=96&&op<=98) circle(p);
#endif
#ifndef NOPIX
  else if (op==99) findpixel(p);
  else if (op==100) bouncepix(p);
#endif
#ifndef NOFIRE
  else if (op==101) firemove(p);
#endif
  else
  {
#ifndef NOOFFSET
    offset(p);
#endif
  }
}
