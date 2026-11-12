// Provided under the GPL v2 license. See the included LICENSE.txt for details.

// src/custom.h defines the following:
//
// queue[]     - points to the 4K Display Data Bank
//             - treat as RAM
//             - Any data passed to/from the ARM and 6507 must be done via queue[]
//
// flashdata[] - points to the 24K that comprises the six 4K banks.
//             - treat as ROM
#include "src/custom.h"


// types of variables, storage used and range
// const              = constant, which is compiled into the ROM section and cannot be changed during run time.
// char               =  8 bit, 1 byte  per value.  Range is           -128 to           127
// unsigned char      =  8 bit, 1 byte  per value.  Range is              0 to           255
// short int          = 16 bit, 2 bytes per value.  Range is        -32,768 to        32,767
// unsigned short int = 16 bit, 2 bytes per value.  Range is              0 to        65,535
// int                = 32 bit, 4 bytes per value.  Range is -2,147,483,648 to 2,147,483,647
// unsigned int       = 32 bit, 4 bytes per value.  Range is              0 to 4,294,967,295
// long int           = same as int
// float              = 32 bit, 4 bytes.  Not Supported#
// double             = 64 bit, 8 bytes.  Not Supported#
// *                  = 32 bit, 4 bytes, pointer (ie: char*, int*)
//
// # - at least not supported with the compiler under OS X.  It might be supported by the Linux/Windows ARM
//     compiler - but support would be implemented via software as the ARM in the Harmony Cartridge does not
//     have an FPU (floating point unit).  As such, performance will most likely be as good as using
//     integer math based routines.
//
// NOTE : Only 448 bytes are allocated for use by variables (the rest of the 512 byte section is used 
//        as the stack).  If you use too many variables, you'll get a compile time error:  "region ram is full"
//        You can use RAM in the Display Data to store values, see defines.h for queue[xxx] defines
//
// NOTE : Compiled code can be significantly smaller if you use INTs for your variables instead of
//        SHORTs or CHARs.

volatile unsigned char *queue=(unsigned char *)0x40000C00;
volatile unsigned char *flashdata=(unsigned char *)0x0C00;
volatile int *queue_int=(int *)0x40000C00;
enum {
SpriteGfxIndex,
junk1,
junk2,
junk3,
junk4, // placeholders
junk5a, // placeholders
junk6a, // placeholders
junk78, // placeholders
junk8a, // placeholders
spritedisplay,
player0x,
player1x,
player2x,
player3x,
player4x,
player5x,
player6x,
player7x,
player8x,
player9x,
player0y,
player1y,
player2y,
player3y,
player4y,
player5y,
player6y,
player7y,
player8y,
player9y,
player0color, junk5,
player0height,
player1height,
player2height,
player3height,
player4height,
player5height,
player6height,
player7height,
player8height,
player9height,
_NUSIZ1,
NUSIZ2,
NUSIZ3,
NUSIZ4,
NUSIZ5,
NUSIZ6,
NUSIZ7,
NUSIZ8,
NUSIZ9,
score,score2,score3,
COLUM0,
COLUM1,
player0pointerlo,
player0pointerhi,
// end of RAM, start of playerpointers
player1pointerlo,
player1pointerhi,
player2pointerlo,
player2pointerhi,
player3pointerlo,
player3pointerhi,
player4pointerlo,
player4pointerhi,
player5pointerlo,
player5pointerhi,
player6pointerlo,
player6pointerhi,
player7pointerlo,
player7pointerhi,
player8pointerlo,
player8pointerhi,
player9pointerlo,
player9pointerhi,
player1color, junk6,
player2color, junk7,
player3color, junk8,
player4color, junk9,
player5color, junk10,
player6color, junk11,
player7color, junk12,
player8color, junk13,
player9color, junk14
};

 enum {SKIP,OVERLAP,NOOVERLAP};

// global variables are those found outside of any function.  They can be used by any function.
// The Harmony Cartridge preserves these values for you between ARM code calls.

unsigned char *C_function=(unsigned int *)(0x40000C00 + 0x1A4);
unsigned short *fetcher_address_table=(unsigned short *)(0xC00 + 0x61A0);
unsigned char *RIOT=(unsigned char *)(0x40000C00 + 0x1A8);
//unsigned char *HMdiv=(unsigned char *)(0xc00+0x1000);
unsigned char *fetcheraddr;
#ifdef DPC_OFFSET
// Where the program in the ROM (see armprog.c) is: the build puts the address of it (as a Thumb address) over this number once the ROM is assembled.
static const volatile unsigned int progaddr=0x7E57A4D1;
#endif
unsigned char *pfpixel;
int count;
//int Gfxindex;
//signed int temp1;
//int temp2; 
//int temp3;
int temp4;
int temp5;
int temp6;
unsigned int mask;

 // masking: NUSIZ bit 7=off/on, NUSIZ 6=L/R
 // no-mask entries replaced by later if...then which is a bit smaller.
 // in their place is masking for reflected sprites.
const unsigned char maskdata[32]=
	{
	 0,0x01,0x03,0x07,0x0F,0x1F,0x3F,0x7F,
	 0xFE,0xFC,0xF8,0xF0,0xE0,0xC0,0x80,0,
         0,0x80,0xC0,0xE0,0xF0,0xF8,0xFC,0xFE,
         0x7F,0x3F,0x1F,0x0F,0x07,0x03,0x01,0
          };

char spritesort[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 0};
char myGfxIndex[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 0};

// changed maxsprites to a variable value, so unused sprite memory can be claimed
char maxsprites;

#define    kernello(a) fetcheraddr[(a)]
#define    kernelhi(a) fetcheraddr[(a)+11]
#define    dflow(a) fetcheraddr[(a)+22]
#define    dfhigh(a)  fetcheraddr[(a)+30]
#define    dffraclo(a)  fetcheraddr[(a)+38]
#define    dffrachi(a)  fetcheraddr[(a)+46]
#define    scoregraphics(a)  fetcheraddr[(a)+54]
#define    scorepointer(a)  fetcheraddr[(a)+56]
#define    Hmval(a)  fetcheraddr[(a)+58]
#define    Hmval74(a)  fetcheraddr[(a)+66]

void my_memcpy(unsigned char* destination, unsigned char* source, int offset, int count)
{ 
        int i; //saves a few bytes
        for(i=0;i<count;i++)
                destination[(i+offset)&255] = source[i]&mask;
} 

void my_memset(unsigned char* destination, int fill_value, int count)
{
        int i; //saves a few bytes
        for (i=0;i<count;i++)
                destination[i]=fill_value;
}

void reverse(int i, int j, unsigned char* x)
{ 
        int t;
        while (i < j) 
        {
              t = x[i]; x[i] = x[j]; x[j] = t;
              i++;
              j--;
        }
}

void memscroll(unsigned char* qmemory, unsigned char offset)
{
        // the classic "shift N elements through reversal" algorithm
        reverse(0,offset-1,qmemory);
        reverse(offset,255,qmemory);
        reverse(0,255,qmemory);
}

unsigned int get32bitdff(int offset)
{
  return((dffrachi(offset)<<8)+dffraclo(offset));
}

unsigned int get32bitdf(int offset)
{
  return((dfhigh(offset)<<8)+dflow(offset));
}

void shiftnumbers(int xreg)
{
  while (xreg!=maxsprites-1)
  {
    myGfxIndex[xreg]=myGfxIndex[xreg+1];
    xreg++;
  }
  
}

char checkwrap(char a, char b)
{
  if (((a+b)&255)<b) return 0;
  return a;
}

int checkswap(int a, int b)
{
  signed int temp1;
  unsigned int hb=RIOT[player1height+b];
  temp1=checkwrap(RIOT[player1y+a],RIOT[player1height+a])-checkwrap(RIOT[player1y+b],hb);
  // A sprite with no height draws nothing (the text kernel keeps one at the line of its row), so next to a sprite that has a height it takes no line
  // from it: it only has to be in order. Without this a text row put a sprite of no height within 5 lines of the paddle and the two took turns being left
  // out, the paddle drawn every other frame. (Only for that pair and only that close: sprites that all have no height, the unused ones that wait off the
  // picture, are put on one display line together as they always were, and farther apart the order is what it always was; leaving the rest of them on
  // lines of their own drew the paddle some pixels to the right of where it is.)
  if ((!RIOT[player1height+a])!=(!hb) && (unsigned)(temp1+5)<=10)
    return temp1>=0?SKIP:NOOVERLAP;
  // The one higher on the screen more than 5 lines and its height away from the other: no overlap; anything else overlaps (the batari Basic sort's
  // test, written shorter: for a lower or equal one it always came to OVERLAP, its value xor 255 less 5 being negative or more than 0).
  if (temp1>5 && temp1-5>(signed int)hb)
    return SKIP;
  return OVERLAP;
}

// The y a sprite is put in order by: the one checkswap works with.
int sortkey(int a)
{
  return (unsigned char)checkwrap(RIOT[player1y+a],RIOT[player1height+a]);
}

void copynybble(unsigned char num)
{
    int i;
    unsigned char *destination;
    unsigned char *source;
    destination=queue+(scorepointer(1)<<8)+scorepointer(0)+((temp5++)<<3);
#ifdef DPC_SCOREFONT
    // The table of digits in use: its address (bank coded, two bytes) is in the display memory, the 89th and 90th byte of the score
    // digits, put there by the program (the primary font's at the start, and the secondary font's when a "Score set font to" block says so).
    source=flashdata+(queue[(scorepointer(1)<<8)+scorepointer(0)+89]<<8)+queue[(scorepointer(1)<<8)+scorepointer(0)+88]+((num&0x0F)<<3);
#else
    source=flashdata+(scoregraphics(1)<<8)+scoregraphics(0)+((num&0x0F)<<3);
#endif
        for(i=0;i<8;i++)
                destination[i] = source[7-i];

}

void on_off_flip(unsigned int loc, unsigned int fnmask)
{
  switch(C_function[0]&3)
  {
    case 0://on
      pfpixel[loc]|=fnmask;
      return;
    case 1://off
      pfpixel[loc]&=~fnmask;
      return;
    case 2://flip
      pfpixel[loc]^=fnmask;
      return;
    default://reserved (for what?)
      break;
  }
}


// main() is what gets called when you store 0xFF into DPC+ register CALLFUNCTION in your 6507 code.
// The bit of playfield column i (0 to 31) in its byte: the first and third bytes of a row have their left column in bit 7, the second and fourth in bit 0.
// (Worked out here instead of a table of 32 bytes: the program sits in bank 1 next to the kernel.)
static unsigned int setbyte(unsigned int i)
{
  unsigned int s=i&7;
  return (i&8)?(1u<<s):(0x80u>>s);
}

int main()
{

  int i;

  // moving the the scope of these variables saved a *lot* of space. 
  int temp2;
  int temp3;
  int Gfxindex;
  unsigned char *HMdiv=(unsigned char *)(0xc00+0x1000);

  fetcheraddr=flashdata+fetcher_address_table[0];

  // preindex these to save some space...
  unsigned char C_function1=C_function[1];
  unsigned char C_function2=C_function[2];
  unsigned char C_function3=C_function[3];

#ifdef DPC_OFFSET
  if (C_function[0]>=68) // the program that is in the ROM as data (Playfield offset: 68 to 75, the playfield box test: 128 and up), (it finds the first column of the playfield itself)
  {
    ((void(*)(void))progaddr)();
    return;
  }
#endif
  switch (C_function[0]&0xFC)
  {
    case 4: // pfvline xpos ypos endypos function
    {
      pfpixel=queue+get32bitdff(C_function3>>3); // physical addy of xpos (pf)
      for (i=C_function2;i<=C_function1;++i)
      {
        on_off_flip(i,setbyte(C_function3));
      }
      return;
    }
    case 8: // pfhline
    {
      for (i=C_function3;i<=C_function1;++i)
      {
        pfpixel=queue+get32bitdff(i>>3); // physical addy of xpos (pf)
        on_off_flip(C_function2,setbyte(i));
      }
      return;
    }
    case 12: // pfpixel
    {
      pfpixel=queue+get32bitdff(C_function3>>3); // physical addy of xpos (pf)
      on_off_flip(C_function2,setbyte(C_function3));
      return;
    }
    case 16: // zero-fill
    {
      my_memset(RIOT+player1pointerlo,0,4096-0x1a8-player1pointerlo);
      return;
    }
    case 20: // collision check
    {
      // takes virtual sprite, returns coll
      // syntax: sprite[1], sprite[2] (missiles, ball not yet, pf done another way)
      // draw sprites in virtual area
      C_function[3]=0;
      temp2=0;
      for (i=RIOT[player0y+C_function2];i<RIOT[player0y+C_function2]+RIOT[player0height+C_function2];++i) 
      {
        if ((i>=RIOT[player0y+C_function1]) && (i<RIOT[player0y+C_function1]+RIOT[player0height+C_function1]))
	{

          temp3=RIOT[player0x+C_function2]-RIOT[player0x+C_function1]+7; //-7 to +7 -> 0 to 14
          if (temp3<15)
	  {
            temp2=((flashdata[(RIOT[player0pointerhi+C_function2*2]<<8)+RIOT[player0pointerlo+C_function2*2]+i-RIOT[player0y+C_function2]])<<7)
                & ((flashdata[(RIOT[player0pointerhi+C_function1*2]<<8)+RIOT[player0pointerlo+C_function1*2]+i-RIOT[player0y+C_function1]])<<temp3);
	  }
	  if (temp2) 
	  {
	    C_function[3]=255;
	    return;
	  }
	}
      }
      return;
    }
    case 24: // pfread 
    {
      pfpixel=queue+get32bitdff(C_function1>>3); // physical addy of xpos (pf)
      C_function[3]=(!(pfpixel[C_function2]&setbyte(C_function1)));
      return;
    }
    case 28: // pfclear
    {
      my_memset(queue+get32bitdff(0),C_function1,1024);
      return;
    }
    case 32: // pfscroll
    {
      for(temp3=C_function2;temp3<C_function3;temp3++)
        memscroll(queue+get32bitdff(temp3),C_function1);
      return;
    }

#ifdef DPC_MATH
    case 40: // div8: C_function1 / C_function2 back in C_function[3]. A divisor under 2 gives the numerator
    {        // unchanged, as the 6502's "jsr div8" does.
      unsigned int rest=C_function1;
      unsigned int share=0;
      if (C_function2>1) for (;rest>=C_function2;++share) rest-=C_function2; else share=rest;
      C_function[3]=share;
      return;
    }
#endif
#ifdef DPC_ROWS
    case 56: // playfield rows of two lines (the Jump block's box test): C_function1 and C_function2 are the lines, C_function3 the
    {        // row increment of the background showing (DFxFRACINC); the rows, line * increment / 256, back in C_function[1] and [2].
      unsigned int inc=C_function3;
      unsigned int row1=(C_function1*inc)>>8;
      unsigned int row2=(C_function2*inc)>>8;
      C_function[1]=row1;
      C_function[2]=row2;
      return;
    }
    case 60: // the first line of a playfield row: C_function1 is the row, C_function2 the increment; the first line whose row is that
    {        // (at most 255) back in C_function[1], found by halving the range.
      unsigned int row=C_function1;
      unsigned int inc=C_function2;
      unsigned int low=0;
      unsigned int high=255;
      while (low<high)
      {
        unsigned int mid=(low+high)>>1;
        if (((mid*inc)>>8)>=row) high=mid; else low=mid+1;
      }
      C_function[1]=low;
      return;
    }
#endif


  default: // everything else
   break;
  }

  //passed the sprite max as a parameter instead
  maxsprites=C_function1;

  // The sprites are put in order of their y first, whatever order they had in the last frame. The pass below only swaps a sprite with the one next to it
  // and takes the sprite it swapped with out of the frame, so a sprite whose y jumped past others (a hidden one set to y 0 or 255) made those others
  // disappear for a frame. With the sprites in order already, only the ones that overlap are left out, as before.
  // (A sprite is only put past one it overlaps by the pass below, which swaps those every frame so that they take turns being left out.)
  for (i=1;i<maxsprites;i++)
  {
    int moving=spritesort[i];
    int key=sortkey(moving);
    int before=i-1;
    int other;
    while (before>=0 && (other=sortkey(spritesort[before]))>key && other-key>RIOT[player1height+moving]+5)
    {
      spritesort[before+1]=spritesort[before];
      before--;
    }
    spritesort[before+1]=moving;
  }

  for (i=0;i<maxsprites;i++)
  {
    myGfxIndex[i]=spritesort[i];
  }
//loop
  temp3=maxsprites-1;
  temp2=maxsprites-2;
 while (temp2>=0)
 {
  switch(checkswap(spritesort[temp2+1],spritesort[temp2]))
  {
    case OVERLAP:
      temp3--;
      shiftnumbers(temp2);
      break;
    case NOOVERLAP:
      break;
    case SKIP:
      temp2--;
    default:
      continue;
  }
  // skipswapgfxtable
  i=spritesort[temp2+1];
  spritesort[temp2+1]=spritesort[temp2];
  spritesort[temp2]=i;
  temp2--;
 }
  for (i=0;i<maxsprites;i++)
    RIOT[SpriteGfxIndex+i]=myGfxIndex[i];
  RIOT[spritedisplay]=temp3;
  // fetcher setup
  //my_memset(queue+(dfhigh(3)<<8)+dflow(3),0,192);
  mask=0xFF; // the ones in bss start as whatever the RAM held, which showed in the first frame's player0
  // The whole of each 256 byte buffer: the kernel can draw more lines than 192, and a sprite drawn over the last ones left them
  // there after it moved away (192 bytes were cleared).
  my_memset(queue+get32bitdf(3),0,256);

  //my_memset(queue+(dfhigh(1)<<8)+dflow(1),RIOT[COLUM1],192); // clear multiplexed sprites and fill colors
  my_memset(queue+get32bitdf(1),RIOT[COLUM1],256); // clear multiplexed sprites and fill colors
  //my_memset(queue+(dfhigh(0)<<8)+dflow(0)-1,RIOT[COLUM0],193); // fill COLUM0 colors
  my_memset(queue+get32bitdf(0)-1,RIOT[COLUM0],257); // fill COLUM0 colors

  // fill color from player0, wrapping if necessary...
  //my_memcpy(queue+(dfhigh(0)<<8)+dflow(0),
  my_memcpy(queue+get32bitdf(0),
            flashdata+(RIOT[player0color+1]<<8)+RIOT[player0color], RIOT[player0y],
            RIOT[player0height]);

  //my_memcpy(queue+(dfhigh(2)<<8)+dflow(2),
  my_memcpy(queue+get32bitdf(2),
            flashdata+(RIOT[player0pointerhi]<<8)+RIOT[player0pointerlo], 0,
            RIOT[player0height]);

  count=0;
  temp4=0;
  while (temp4 != 511)
  {
    Gfxindex=myGfxIndex[count];
//check if on screen, copy only if it is
//    if (RIOT[player1y+Gfxindex]<175)
  //  {

 // masking: NUSIZ bit 7=on/off, NUSIZ 6=L/R
 // appears to happen @ 0x99-0x9F
      mask = 0xFF;
      if (RIOT[_NUSIZ1+Gfxindex]>127)
      {
        if (RIOT[player1x+Gfxindex]>=0x99)
        {
           // modified to work with reflected sprites
           mask=maskdata[((RIOT[_NUSIZ1+Gfxindex]&64)>>3)^((RIOT[_NUSIZ1+Gfxindex]&8)<<1)|(RIOT[player1x+Gfxindex]-0x99)];
        }
      }
      //my_memcpy(queue+(dfhigh(3)<<8)+dflow(3),
      my_memcpy(queue+get32bitdf(3),
              flashdata+(RIOT[player1pointerhi+Gfxindex*2]<<8)+RIOT[player1pointerlo+Gfxindex*2],
              RIOT[player1y+Gfxindex],
              RIOT[player1height+Gfxindex]);
      mask = 0xFF;
      //my_memcpy(queue+(dfhigh(1)<<8)+dflow(1),
      my_memcpy(queue+get32bitdf(1),
              flashdata+(RIOT[player1color+Gfxindex*2+1]<<8)+RIOT[player1color+Gfxindex*2],
	      RIOT[player1y+Gfxindex],
              RIOT[player1height+Gfxindex]);
    //}
    temp5=temp4;
    temp4=(RIOT[player1y+Gfxindex]+RIOT[player1height+Gfxindex])&255; // &255 to allow for wrapped sprites 
    Gfxindex=myGfxIndex[count+1];
    if ((count == temp3) || (RIOT[player1y+Gfxindex]>175) )
    {
      temp4=511;
      temp5=0;
    }

    // it looks like if vertical positioning is tight, cumulative round-off 
    // can occur and eventually coarse positioning will happen during sprite display...
     //queue[(dfhigh(4)<<8)+dflow(4)+count]=(temp4-temp5-(count>>1))>>1;
     queue[get32bitdf(4)+count]=(temp4-temp5-(count>>1))>>1;

    if (RIOT[player1x+Gfxindex]>159)
      RIOT[player1x+Gfxindex]-=(RIOT[player1x+Gfxindex]>208)?96:160;
    queue[get32bitdff(5)+count]=RIOT[_NUSIZ1+Gfxindex];
    queue[get32bitdff(7)+count]=Hmval74(RIOT[player1x+Gfxindex]);
    //queue[(dfhigh(5)<<8)+dflow(5)+count]=kernello(HMdiv[RIOT[player1x+Gfxindex]]);
    queue[get32bitdf(5)+count]=kernello(HMdiv[RIOT[player1x+Gfxindex]]);
    //queue[(dfhigh(6)<<8)+dflow(6)+count]=kernelhi(HMdiv[RIOT[player1x+Gfxindex]]);
    queue[get32bitdf(6)+count]=kernelhi(HMdiv[RIOT[player1x+Gfxindex]]);
    count++;
  }
  temp5=1;
  for (i=score;i<=score3;i++)
  {
    copynybble(RIOT[i]);
    copynybble(RIOT[i] >> 4);
  }

  return 0;
}
