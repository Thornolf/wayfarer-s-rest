#!/usr/bin/env bash
# Rebuilds the derived sounds of the audio test (step 1) from the five original test sounds.
# Everything here is synthesized or derived with FFmpeg: placeholders, not real content.
# Usage: bash apps/mobile/scripts/make-test-sounds.sh
set -euo pipefail
cd "$(dirname "$0")/../assets/sounds"
F="ffmpeg -v error -y"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The same rain loop, lossless (ALAC), for the A/B test of the loop seam against AAC. Cut to the
# exact 30 s: the AAC decoder pads the end up to a whole frame.
$F -i rain.m4a -map_metadata -1 -af "atrim=end_sample=1323000" -c:a alac rain-alac.m4a

# seamless_loop <noise source> <filters> <total seconds> <overlap seconds> <gain> <output>
# Crossfades the tail of the noise into its head, so the last sample runs into the first one and
# the loop has no click.
seamless_loop() {
  $F -f lavfi -i "$1" -af "$2" "$TMP/noise.wav"
  $F -ss "$4" -i "$TMP/noise.wav" -t "$4" -i "$TMP/noise.wav" -filter_complex \
    "[0][1]acrossfade=d=$4:c1=qsin:c2=qsin,volume=$5" -ac 1 -sample_fmt s16p -c:a alac "$6"
}

# The continuous noise bed: brown noise, very soft, 19 s.
seamless_loop "anoisesrc=d=21:c=brown:r=22050:a=0.5:s=7" "lowpass=f=500" 21 2 -6dB bed-alac.m4a

# A wind sub-ambience: band-passed pink noise with a slow swell, 23 s. Its length shares no factor
# with the rain (30 s) or the bed (19 s), so the sum repeats rarely.
seamless_loop "anoisesrc=d=26:c=pink:r=22050:a=0.6:s=11" "bandpass=f=420:w=300,tremolo=f=0.13:d=0.6" 26 3 4dB wind-alac.m4a

# Variants for the shuffle bag, made by resampling the originals (pitch and speed move together).
$F -i bird.m4a -af "asetrate=44100*1.18,aresample=44100" -c:a aac -b:a 96k bird-02.m4a
$F -i bird.m4a -af "asetrate=44100*0.86,aresample=44100,areverse" -c:a aac -b:a 96k bird-03.m4a
$F -i steps.m4a -af "asetrate=44100*0.9,aresample=44100,lowpass=f=3000" -c:a aac -b:a 64k steps-02.m4a
$F -i mining.m4a -af "asetrate=44100*1.12,aresample=44100" -c:a aac -b:a 64k mining-02.m4a

for f in *.m4a; do
  echo "$f $(ffprobe -v error -show_entries format=duration:stream=codec_name,channels,sample_rate -of csv=p=0 "$f" | tr '\n' ' ') $(stat -c %s "$f") bytes"
done
