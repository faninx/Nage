"use client"

import { useMemo, useState, type ChangeEvent } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Search, Smile, X } from "lucide-react"
import { cn } from "@/lib/utils"

// 校验：1 个 grapheme cluster 且全部在 Emoji 块（与 schemas.ts 保持一致）
const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\u{200D}\u{FE0F}\u{20E3}\p{Mark}]+$/u

function isValidEmoji(s: string): boolean {
  if (s === "") return true
  if (!EMOJI_RE.test(s)) return false
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let count = 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _seg of segmenter.segment(s)) {
    count++
    if (count > 1) return false
  }
  return count === 1
}

type EmojiItem = { char: string; name: string }
type Group = { key: string; label: string; icon: string; emojis: EmojiItem[] }

// 参考 Notion 的 8 大分类（Unicode 标准分类），每组 50-80 个
const GROUPS: Group[] = [
  {
    key: "smileys",
    label: "表情",
    icon: "😀",
    emojis: [
      { char: "😀", name: "smile grin happy" },
      { char: "😃", name: "smile happy joy" },
      { char: "😄", name: "smile laugh happy joy" },
      { char: "😁", name: "grin teeth smile" },
      { char: "😆", name: "laugh xd happy" },
      { char: "😅", name: "sweat smile nervous" },
      { char: "🤣", name: "rofl laugh tears" },
      { char: "😂", name: "joy laugh tears lol" },
      { char: "🙂", name: "smile simple" },
      { char: "🙃", name: "upside down flip" },
      { char: "😉", name: "wink" },
      { char: "😊", name: "blush shy happy" },
      { char: "😇", name: "angel halo innocent" },
      { char: "🥰", name: "love heart eyes" },
      { char: "😍", name: "heart eyes love" },
      { char: "🤩", name: "star eyes excited" },
      { char: "😘", name: "kiss heart" },
      { char: "😗", name: "kiss" },
      { char: "☺️", name: "smile relaxed" },
      { char: "😚", name: "kiss shy" },
      { char: "😙", name: "kiss" },
      { char: "🥲", name: "smile tear sad" },
      { char: "😋", name: "yum tongue food" },
      { char: "😛", name: "tongue" },
      { char: "😜", name: "wink tongue playful" },
      { char: "🤪", name: "crazy wild zany" },
      { char: "😝", name: "tongue eyes closed" },
      { char: "🤑", name: "money mouth rich" },
      { char: "🤗", name: "hug hands" },
      { char: "🤭", name: "hand mouth oops" },
      { char: "🤫", name: "shh quiet hush" },
      { char: "🤔", name: "think thinking" },
      { char: "🤐", name: "zip mouth silent" },
      { char: "🤨", name: "raised brow suspicious" },
      { char: "😐", name: "neutral meh" },
      { char: "😑", name: "expressionless" },
      { char: "😶", name: "no mouth silent" },
      { char: "😏", name: "smirk smug" },
      { char: "😒", name: "unamused annoyed" },
      { char: "🙄", name: "eye roll" },
      { char: "😬", name: "grimace awkward" },
      { char: "🤥", name: "liar pinocchio" },
      { char: "😌", name: "relieved content" },
      { char: "😔", name: "sad pensive" },
      { char: "😪", name: "sleepy tired" },
      { char: "🤤", name: "drool" },
      { char: "😴", name: "sleep zzz" },
      { char: "😷", name: "mask sick covid" },
      { char: "🤒", name: "thermometer sick" },
      { char: "🤕", name: "bandage hurt" },
      { char: "🤢", name: "nauseated sick" },
      { char: "🤮", name: "vomit" },
      { char: "🤧", name: "sneeze tissue" },
      { char: "🥵", name: "hot sweat" },
      { char: "🥶", name: "cold freezing" },
      { char: "🥴", name: "woozy dizzy" },
      { char: "😵", name: "dizzy shocked" },
      { char: "🤯", name: "mind blown explode" },
      { char: "🤠", name: "cowboy hat" },
      { char: "🥳", name: "party celebrate" },
      { char: "😎", name: "cool sunglasses" },
      { char: "🤓", name: "nerd glasses" },
      { char: "🧐", name: "monocle" },
      { char: "😕", name: "confused" },
      { char: "😟", name: "worried sad" },
      { char: "🙁", name: "frown sad" },
      { char: "☹️", name: "frown" },
      { char: "😮", name: "open mouth wow" },
      { char: "😯", name: "hushed" },
      { char: "😲", name: "astonished shock" },
      { char: "😳", name: "flushed embarrassed" },
      { char: "🥺", name: "pleading puppy" },
      { char: "😦", name: "frown open" },
      { char: "😧", name: "anguished" },
      { char: "😨", name: "fearful scared" },
      { char: "😰", name: "anxious sweat" },
      { char: "😥", name: "sad sweat relief" },
      { char: "😢", name: "cry tear" },
      { char: "😭", name: "sobbing cry" },
      { char: "😱", name: "scream fear" },
      { char: "😖", name: "confused frustrated" },
      { char: "😣", name: "persevere" },
      { char: "😞", name: "disappointed" },
      { char: "😓", name: "sweat cold" },
      { char: "😩", name: "weary tired" },
      { char: "😫", name: "tired" },
      { char: "🥱", name: "yawn tired" },
      { char: "😤", name: "triumph angry steam" },
      { char: "😡", name: "rage angry red" },
      { char: "😠", name: "angry mad" },
      { char: "🤬", name: "swear curse" },
      { char: "😈", name: "devil smile" },
      { char: "👿", name: "imp angry" },
      { char: "💀", name: "skull death" },
      { char: "☠️", name: "skull crossbones" },
      { char: "💩", name: "poop" },
      { char: "🤡", name: "clown" },
      { char: "👹", name: "ogre japanese" },
      { char: "👺", name: "goblin" },
      { char: "👻", name: "ghost halloween" },
      { char: "👽", name: "alien ufo" },
      { char: "👾", name: "space invader" },
      { char: "🤖", name: "robot" },
    ],
  },
  {
    key: "people",
    label: "人物",
    icon: "👋",
    emojis: [
      { char: "👋", name: "wave hello hi" },
      { char: "🤚", name: "raised back hand" },
      { char: "🖐", name: "hand spread fingers" },
      { char: "✋", name: "raised hand stop" },
      { char: "🖖", name: "vulcan spock" },
      { char: "👌", name: "ok ok-hand" },
      { char: "🤌", name: "pinched fingers" },
      { char: "🤏", name: "pinch small" },
      { char: "✌️", name: "peace victory" },
      { char: "🤞", name: "crossed fingers luck" },
      { char: "🤟", name: "love you gesture" },
      { char: "🤘", name: "rock horns metal" },
      { char: "🤙", name: "call me shaka" },
      { char: "👈", name: "point left" },
      { char: "👉", name: "point right" },
      { char: "👆", name: "point up" },
      { char: "🖕", name: "middle finger" },
      { char: "👇", name: "point down" },
      { char: "☝️", name: "point up index" },
      { char: "👍", name: "thumbs up like yes" },
      { char: "👎", name: "thumbs down dislike no" },
      { char: "✊", name: "raised fist" },
      { char: "👊", name: "oncoming fist punch" },
      { char: "🤛", name: "left fist" },
      { char: "🤜", name: "right fist" },
      { char: "👏", name: "clap applause" },
      { char: "🙌", name: "raising hands hooray" },
      { char: "👐", name: "open hands" },
      { char: "🤲", name: "palms up" },
      { char: "🤝", name: "handshake deal" },
      { char: "🙏", name: "pray thanks please" },
      { char: "✍️", name: "writing" },
      { char: "💅", name: "nail polish" },
      { char: "🤳", name: "selfie phone" },
      { char: "💪", name: "muscle strong bicep" },
      { char: "🦾", name: "mechanical arm" },
      { char: "🦵", name: "leg" },
      { char: "🦿", name: "mechanical leg" },
      { char: "🦶", name: "foot" },
      { char: "👂", name: "ear hearing" },
      { char: "🦻", name: "hearing aid" },
      { char: "👃", name: "nose smell" },
      { char: "🧠", name: "brain" },
      { char: "🦷", name: "tooth dental" },
      { char: "🦴", name: "bone" },
      { char: "👀", name: "eyes look" },
      { char: "👁", name: "eye" },
      { char: "👅", name: "tongue lick" },
      { char: "👄", name: "lips mouth" },
      { char: "🩸", name: "blood drop" },
      { char: "👶", name: "baby" },
      { char: "🧒", name: "child" },
      { char: "👦", name: "boy" },
      { char: "👧", name: "girl" },
      { char: "🧑", name: "person adult" },
      { char: "👨", name: "man" },
      { char: "👩", name: "woman" },
      { char: "🧓", name: "older person" },
      { char: "👴", name: "old man grandpa" },
      { char: "👵", name: "old woman grandma" },
      { char: "👮", name: "police cop" },
      { char: "👷", name: "construction worker" },
      { char: "💂", name: "guard" },
      { char: "🕵", name: "detective spy" },
      { char: "👼", name: "baby angel" },
      { char: "🎅", name: "santa christmas" },
      { char: "🤶", name: "mrs claus" },
      { char: "🦸", name: "superhero" },
      { char: "🦹", name: "supervillain" },
      { char: "🧙", name: "mage wizard" },
      { char: "🧚", name: "fairy" },
      { char: "🧛", name: "vampire dracula" },
      { char: "🧜", name: "merperson" },
      { char: "🧝", name: "elf" },
      { char: "🧞", name: "genie" },
      { char: "🧟", name: "zombie" },
      { char: "💆", name: "massage face" },
      { char: "💇", name: "haircut" },
      { char: "🚶", name: "person walking" },
      { char: "🏃", name: "person running" },
      { char: "💃", name: "dancer woman" },
      { char: "🕺", name: "dancer man" },
      { char: "🧖", name: "sauna person" },
      { char: "🧗", name: "climbing" },
      { char: "🤺", name: "fencing" },
      { char: "🏇", name: "horse racing" },
      { char: "⛷", name: "skier" },
      { char: "🏂", name: "snowboarder" },
      { char: "🏌", name: "golfer" },
      { char: "🏄", name: "surfer" },
      { char: "🚣", name: "rowboat" },
      { char: "🏊", name: "swimmer" },
      { char: "⛹", name: "basketball" },
      { char: "🏋", name: "weightlifter" },
      { char: "🚴", name: "cyclist bike" },
      { char: "🚵", name: "mountain biker" },
      { char: "🤸", name: "cartwheel gymnast" },
      { char: "🤼", name: "wrestlers" },
      { char: "🤽", name: "water polo" },
      { char: "🤾", name: "handball" },
    ],
  },
  {
    key: "animals",
    label: "动物",
    icon: "🐱",
    emojis: [
      { char: "🐶", name: "dog puppy face" },
      { char: "🐱", name: "cat kitten face" },
      { char: "🐭", name: "mouse face" },
      { char: "🐹", name: "hamster" },
      { char: "🐰", name: "rabbit bunny" },
      { char: "🦊", name: "fox" },
      { char: "🐻", name: "bear" },
      { char: "🐼", name: "panda" },
      { char: "🐨", name: "koala" },
      { char: "🐯", name: "tiger face" },
      { char: "🦁", name: "lion" },
      { char: "🐮", name: "cow face" },
      { char: "🐷", name: "pig face" },
      { char: "🐸", name: "frog" },
      { char: "🐵", name: "monkey face" },
      { char: "🐔", name: "chicken" },
      { char: "🐧", name: "penguin" },
      { char: "🐦", name: "bird" },
      { char: "🐤", name: "baby chick" },
      { char: "🐣", name: "hatching chick egg" },
      { char: "🐥", name: "front chick" },
      { char: "🦆", name: "duck" },
      { char: "🦅", name: "eagle" },
      { char: "🦉", name: "owl" },
      { char: "🦇", name: "bat" },
      { char: "🐺", name: "wolf" },
      { char: "🐗", name: "boar" },
      { char: "🐴", name: "horse face" },
      { char: "🦄", name: "unicorn" },
      { char: "🐝", name: "bee honey" },
      { char: "🐛", name: "bug caterpillar" },
      { char: "🦋", name: "butterfly" },
      { char: "🐌", name: "snail" },
      { char: "🐞", name: "lady beetle" },
      { char: "🐜", name: "ant" },
      { char: "🦟", name: "mosquito" },
      { char: "🕷", name: "spider" },
      { char: "🦂", name: "scorpion" },
      { char: "🐢", name: "turtle" },
      { char: "🐍", name: "snake" },
      { char: "🦎", name: "lizard" },
      { char: "🦖", name: "t rex dinosaur" },
      { char: "🦕", name: "sauropod dinosaur" },
      { char: "🐙", name: "octopus" },
      { char: "🦑", name: "squid" },
      { char: "🦐", name: "shrimp" },
      { char: "🦞", name: "lobster" },
      { char: "🦀", name: "crab" },
      { char: "🐡", name: "blowfish" },
      { char: "🐠", name: "tropical fish" },
      { char: "🐟", name: "fish" },
      { char: "🐬", name: "dolphin" },
      { char: "🐳", name: "whale spout" },
      { char: "🐋", name: "whale" },
      { char: "🦈", name: "shark" },
      { char: "🐊", name: "crocodile" },
      { char: "🐅", name: "tiger" },
      { char: "🐆", name: "leopard" },
      { char: "🦓", name: "zebra" },
      { char: "🦍", name: "gorilla" },
      { char: "🐘", name: "elephant" },
      { char: "🦏", name: "rhino" },
      { char: "🐪", name: "camel dromedary" },
      { char: "🐫", name: "bactrian camel" },
      { char: "🦒", name: "giraffe" },
      { char: "🐃", name: "water buffalo" },
      { char: "🐂", name: "ox" },
      { char: "🐄", name: "cow" },
      { char: "🐎", name: "horse" },
      { char: "🐖", name: "pig" },
      { char: "🐏", name: "ram" },
      { char: "🐑", name: "sheep" },
      { char: "🦙", name: "llama" },
      { char: "🐐", name: "goat" },
      { char: "🦌", name: "deer" },
      { char: "🐕", name: "dog" },
      { char: "🐩", name: "poodle" },
      { char: "🦮", name: "guide dog" },
      { char: "🐈", name: "cat" },
      { char: "🐓", name: "rooster" },
      { char: "🦃", name: "turkey" },
      { char: "🦚", name: "peacock" },
      { char: "🦜", name: "parrot" },
      { char: "🦢", name: "swan" },
      { char: "🦩", name: "flamingo" },
      { char: "🕊", name: "dove peace" },
      { char: "🐇", name: "rabbit" },
      { char: "🦝", name: "raccoon" },
      { char: "🦨", name: "skunk" },
      { char: "🦡", name: "badger" },
      { char: "🦦", name: "otter" },
      { char: "🦥", name: "sloth" },
      { char: "🐁", name: "mouse" },
      { char: "🐀", name: "rat" },
      { char: "🐿", name: "chipmunk squirrel" },
      { char: "🦔", name: "hedgehog" },
    ],
  },
  {
    key: "food",
    label: "食物",
    icon: "🍔",
    emojis: [
      { char: "🍇", name: "grapes" },
      { char: "🍈", name: "melon" },
      { char: "🍉", name: "watermelon" },
      { char: "🍊", name: "tangerine orange" },
      { char: "🍋", name: "lemon" },
      { char: "🍌", name: "banana" },
      { char: "🍍", name: "pineapple" },
      { char: "🥭", name: "mango" },
      { char: "🍎", name: "apple red" },
      { char: "🍏", name: "apple green" },
      { char: "🍐", name: "pear" },
      { char: "🍑", name: "peach" },
      { char: "🍒", name: "cherries" },
      { char: "🍓", name: "strawberry" },
      { char: "🥝", name: "kiwi" },
      { char: "🍅", name: "tomato" },
      { char: "🥥", name: "coconut" },
      { char: "🥑", name: "avocado" },
      { char: "🍆", name: "eggplant aubergine" },
      { char: "🥔", name: "potato" },
      { char: "🥕", name: "carrot" },
      { char: "🌽", name: "corn" },
      { char: "🌶", name: "pepper hot chili" },
      { char: "🥒", name: "cucumber" },
      { char: "🥬", name: "leafy green lettuce" },
      { char: "🥦", name: "broccoli" },
      { char: "🧄", name: "garlic" },
      { char: "🧅", name: "onion" },
      { char: "🍄", name: "mushroom" },
      { char: "🥜", name: "peanuts" },
      { char: "🌰", name: "chestnut" },
      { char: "🍞", name: "bread loaf" },
      { char: "🥐", name: "croissant" },
      { char: "🥖", name: "baguette bread" },
      { char: "🥨", name: "pretzel" },
      { char: "🥯", name: "bagel" },
      { char: "🥞", name: "pancakes" },
      { char: "🧇", name: "waffle" },
      { char: "🧀", name: "cheese" },
      { char: "🍖", name: "meat bone" },
      { char: "🍗", name: "poultry leg chicken" },
      { char: "🥩", name: "steak beef" },
      { char: "🥓", name: "bacon" },
      { char: "🍔", name: "burger hamburger" },
      { char: "🍟", name: "fries french" },
      { char: "🍕", name: "pizza" },
      { char: "🌭", name: "hotdog" },
      { char: "🥪", name: "sandwich" },
      { char: "🌮", name: "taco" },
      { char: "🌯", name: "burrito wrap" },
      { char: "🥙", name: "stuffed flatbread" },
      { char: "🧆", name: "falafel" },
      { char: "🥚", name: "egg" },
      { char: "🍳", name: "cooking egg fried" },
      { char: "🥘", name: "shallow pan paella" },
      { char: "🍲", name: "pot food" },
      { char: "🥣", name: "bowl cereal" },
      { char: "🥗", name: "salad green" },
      { char: "🍿", name: "popcorn" },
      { char: "🧂", name: "salt" },
      { char: "🥫", name: "canned food" },
      { char: "🍱", name: "bento box" },
      { char: "🍘", name: "rice cracker" },
      { char: "🍙", name: "rice ball" },
      { char: "🍚", name: "rice cooked" },
      { char: "🍛", name: "curry rice" },
      { char: "🍜", name: "noodles ramen" },
      { char: "🍝", name: "pasta spaghetti" },
      { char: "🍠", name: "sweet potato roasted" },
      { char: "🍢", name: "oden" },
      { char: "🍣", name: "sushi" },
      { char: "🍤", name: "fried shrimp" },
      { char: "🍥", name: "fish cake narutomaki" },
      { char: "🥮", name: "moon cake" },
      { char: "🍡", name: "dango" },
      { char: "🥟", name: "dumpling" },
      { char: "🥠", name: "fortune cookie" },
      { char: "🥡", name: "takeout box" },
      { char: "🍦", name: "ice cream soft" },
      { char: "🍧", name: "shaved ice" },
      { char: "🍨", name: "ice cream" },
      { char: "🍩", name: "donut doughnut" },
      { char: "🍪", name: "cookie" },
      { char: "🎂", name: "birthday cake" },
      { char: "🍰", name: "cake shortcake" },
      { char: "🧁", name: "cupcake" },
      { char: "🥧", name: "pie" },
      { char: "🍫", name: "chocolate bar" },
      { char: "🍬", name: "candy sweet" },
      { char: "🍭", name: "lollipop" },
      { char: "🍮", name: "pudding flan custard" },
      { char: "🍯", name: "honey pot" },
      { char: "🍼", name: "baby bottle milk" },
      { char: "🥛", name: "milk glass" },
      { char: "☕", name: "coffee hot" },
      { char: "🫖", name: "teapot" },
      { char: "🍵", name: "tea cup" },
      { char: "🍶", name: "sake" },
      { char: "🍾", name: "champagne bottle" },
      { char: "🍷", name: "wine glass" },
      { char: "🍸", name: "cocktail martini" },
      { char: "🍹", name: "tropical drink" },
      { char: "🍺", name: "beer mug" },
      { char: "🍻", name: "beers clink" },
      { char: "🥂", name: "champagne clink" },
      { char: "🥃", name: "whiskey tumbler" },
      { char: "🥤", name: "cup straw" },
      { char: "🧋", name: "bubble tea" },
      { char: "🧃", name: "juice box" },
      { char: "🧊", name: "ice cube" },
    ],
  },
  {
    key: "activities",
    label: "活动",
    icon: "⚽",
    emojis: [
      { char: "🎃", name: "jackolantern halloween pumpkin" },
      { char: "🎄", name: "christmas tree" },
      { char: "🎆", name: "fireworks" },
      { char: "🎇", name: "sparkler" },
      { char: "🧨", name: "firecracker" },
      { char: "✨", name: "sparkles stars" },
      { char: "🎈", name: "balloon party" },
      { char: "🎉", name: "party popper tada" },
      { char: "🎊", name: "confetti ball" },
      { char: "🎋", name: "tanabata tree" },
      { char: "🎍", name: "pine decoration" },
      { char: "🎎", name: "japanese dolls" },
      { char: "🎏", name: "carp streamer" },
      { char: "🎐", name: "wind chime" },
      { char: "🎑", name: "moon ceremony" },
      { char: "🧧", name: "red envelope" },
      { char: "🎀", name: "ribbon bow" },
      { char: "🎁", name: "gift present" },
      { char: "🎗", name: "reminder ribbon" },
      { char: "🎟", name: "ticket admission" },
      { char: "🎫", name: "ticket" },
      { char: "🎖", name: "medal military" },
      { char: "🏆", name: "trophy cup" },
      { char: "🏅", name: "medal sports" },
      { char: "🥇", name: "gold medal 1st" },
      { char: "🥈", name: "silver medal 2nd" },
      { char: "🥉", name: "bronze medal 3rd" },
      { char: "⚽", name: "soccer football" },
      { char: "⚾", name: "baseball" },
      { char: "🥎", name: "softball" },
      { char: "🏀", name: "basketball" },
      { char: "🏐", name: "volleyball" },
      { char: "🏈", name: "american football" },
      { char: "🏉", name: "rugby" },
      { char: "🎾", name: "tennis" },
      { char: "🥏", name: "frisbee disc" },
      { char: "🎳", name: "bowling" },
      { char: "🏏", name: "cricket" },
      { char: "🏑", name: "field hockey" },
      { char: "🏒", name: "ice hockey" },
      { char: "🥍", name: "lacrosse" },
      { char: "🏓", name: "ping pong" },
      { char: "🏸", name: "badminton" },
      { char: "🥊", name: "boxing glove" },
      { char: "🥋", name: "martial arts uniform" },
      { char: "🥅", name: "goal net" },
      { char: "⛳", name: "golf" },
      { char: "⛸", name: "ice skate" },
      { char: "🎣", name: "fishing pole" },
      { char: "🤿", name: "diving mask" },
      { char: "🎽", name: "running shirt" },
      { char: "🎿", name: "skis" },
      { char: "🛷", name: "sled" },
      { char: "🥌", name: "curling stone" },
      { char: "🎯", name: "target dart bullseye" },
      { char: "🪀", name: "yo-yo" },
      { char: "🪁", name: "kite" },
      { char: "🎮", name: "video game controller" },
      { char: "🎰", name: "slot machine" },
      { char: "🎲", name: "dice game" },
      { char: "🧩", name: "puzzle piece" },
      { char: "♟", name: "chess pawn" },
      { char: "🎭", name: "theater masks drama" },
      { char: "🎨", name: "art palette painting" },
      { char: "🎬", name: "clapperboard movie" },
      { char: "🎤", name: "microphone karaoke" },
      { char: "🎧", name: "headphone music" },
      { char: "🎼", name: "musical score" },
      { char: "🎹", name: "piano keyboard" },
      { char: "🥁", name: "drum" },
      { char: "🎷", name: "saxophone" },
      { char: "🎺", name: "trumpet" },
      { char: "🎸", name: "guitar" },
      { char: "🪕", name: "banjo" },
      { char: "🎻", name: "violin" },
    ],
  },
  {
    key: "travel",
    label: "旅行",
    icon: "✈️",
    emojis: [
      { char: "🚗", name: "car automobile" },
      { char: "🚕", name: "taxi" },
      { char: "🚙", name: "suv" },
      { char: "🚌", name: "bus" },
      { char: "🚎", name: "trolleybus" },
      { char: "🏎", name: "race car" },
      { char: "🚓", name: "police car" },
      { char: "🚑", name: "ambulance" },
      { char: "🚒", name: "fire engine" },
      { char: "🚐", name: "minibus" },
      { char: "🛻", name: "pickup truck" },
      { char: "🚚", name: "delivery truck" },
      { char: "🚛", name: "articulated lorry" },
      { char: "🚜", name: "tractor" },
      { char: "🛴", name: "kick scooter" },
      { char: "🚲", name: "bicycle bike" },
      { char: "🛵", name: "motor scooter" },
      { char: "🏍", name: "motorcycle" },
      { char: "🛺", name: "auto rickshaw" },
      { char: "🚨", name: "siren light" },
      { char: "🚥", name: "traffic light horizontal" },
      { char: "🚦", name: "traffic light vertical" },
      { char: "🚧", name: "construction sign" },
      { char: "⚓", name: "anchor" },
      { char: "⛵", name: "sailboat" },
      { char: "🛶", name: "canoe kayak" },
      { char: "🚤", name: "speedboat" },
      { char: "🛥", name: "motor boat" },
      { char: "🛳", name: "passenger ship cruise" },
      { char: "⛴", name: "ferry" },
      { char: "🚢", name: "ship" },
      { char: "✈️", name: "airplane plane" },
      { char: "🛩", name: "small airplane" },
      { char: "🛫", name: "airplane departure" },
      { char: "🛬", name: "airplane arrival" },
      { char: "🪂", name: "parachute" },
      { char: "💺", name: "seat chair" },
      { char: "🚁", name: "helicopter" },
      { char: "🚟", name: "suspension railway" },
      { char: "🚠", name: "mountain cableway" },
      { char: "🚡", name: "aerial tramway" },
      { char: "🛰", name: "satellite" },
      { char: "🚀", name: "rocket launch" },
      { char: "🛸", name: "flying saucer ufo" },
      { char: "🛎", name: "bellhop bell" },
      { char: "🧳", name: "luggage suitcase" },
      { char: "⌛", name: "hourglass done" },
      { char: "⏳", name: "hourglass not done" },
      { char: "⌚", name: "watch" },
      { char: "⏰", name: "alarm clock" },
      { char: "⏱", name: "stopwatch" },
      { char: "⏲", name: "timer clock" },
      { char: "🕰", name: "mantel clock" },
      { char: "🕛", name: "twelve oclock" },
      { char: "🕧", name: "twelve thirty" },
      { char: "🕐", name: "one oclock" },
      { char: "🕜", name: "one thirty" },
      { char: "🕑", name: "two oclock" },
      { char: "🕝", name: "two thirty" },
      { char: "🕒", name: "three oclock" },
      { char: "🕞", name: "three thirty" },
      { char: "🕓", name: "four oclock" },
      { char: "🕟", name: "four thirty" },
      { char: "🕔", name: "five oclock" },
      { char: "🕠", name: "five thirty" },
      { char: "🕕", name: "six oclock" },
      { char: "🕡", name: "six thirty" },
      { char: "🕖", name: "seven oclock" },
      { char: "🕢", name: "seven thirty" },
      { char: "🕗", name: "eight oclock" },
      { char: "🕣", name: "eight thirty" },
      { char: "🕘", name: "nine oclock" },
      { char: "🕤", name: "nine thirty" },
      { char: "🕙", name: "ten oclock" },
      { char: "🕥", name: "ten thirty" },
      { char: "🕚", name: "eleven oclock" },
      { char: "🕦", name: "eleven thirty" },
      { char: "🌍", name: "earth africa europe" },
      { char: "🌎", name: "earth americas" },
      { char: "🌏", name: "earth asia australia" },
      { char: "🌐", name: "globe meridians" },
      { char: "🗺", name: "world map" },
      { char: "🗾", name: "japan map" },
      { char: "🧭", name: "compass" },
      { char: "🏔", name: "snow capped mountain" },
      { char: "⛰", name: "mountain" },
      { char: "🌋", name: "volcano" },
      { char: "🗻", name: "mount fuji" },
      { char: "🏕", name: "camping" },
      { char: "⛺", name: "tent" },
      { char: "🏞", name: "national park" },
      { char: "🏟", name: "stadium" },
      { char: "🏛", name: "classical building" },
      { char: "🏗", name: "building construction" },
      { char: "🧱", name: "brick" },
      { char: "🏘", name: "houses" },
      { char: "🏚", name: "derelict house" },
      { char: "🏠", name: "house home" },
      { char: "🏡", name: "house garden" },
      { char: "🏢", name: "office building" },
      { char: "🏣", name: "japanese post office" },
      { char: "🏤", name: "post office" },
      { char: "🏥", name: "hospital" },
      { char: "🏦", name: "bank" },
      { char: "🏨", name: "hotel" },
      { char: "🏩", name: "love hotel" },
      { char: "🏪", name: "convenience store" },
      { char: "🏫", name: "school" },
      { char: "🏬", name: "department store" },
      { char: "🏭", name: "factory" },
      { char: "🏯", name: "japanese castle" },
      { char: "🏰", name: "castle european" },
      { char: "💒", name: "wedding" },
      { char: "🗼", name: "tokyo tower" },
      { char: "🗽", name: "statue liberty" },
      { char: "⛪", name: "church" },
      { char: "🕌", name: "mosque" },
      { char: "🛕", name: "hindu temple" },
      { char: "🕍", name: "synagogue" },
      { char: "⛩", name: "shinto shrine" },
      { char: "🕋", name: "kaaba" },
      { char: "⛲", name: "fountain" },
      { char: "⛺", name: "tent" },
      { char: "🌁", name: "foggy" },
      { char: "🌃", name: "night stars" },
      { char: "🏙", name: "cityscape" },
      { char: "🌄", name: "sunrise mountains" },
      { char: "🌅", name: "sunrise" },
      { char: "🌆", name: "cityscape dusk" },
      { char: "🌇", name: "sunset" },
      { char: "🌉", name: "bridge night" },
      { char: "♨", name: "hot springs" },
      { char: "🎠", name: "carousel horse" },
      { char: "🎡", name: "ferris wheel" },
      { char: "🎢", name: "roller coaster" },
      { char: "💈", name: "barber pole" },
      { char: "🎪", name: "circus tent" },
    ],
  },
  {
    key: "objects",
    label: "物品",
    icon: "💡",
    emojis: [
      { char: "👓", name: "glasses eyeglasses" },
      { char: "🕶", name: "sunglasses" },
      { char: "🥽", name: "goggles swimming" },
      { char: "🥼", name: "lab coat" },
      { char: "🦺", name: "safety vest" },
      { char: "👔", name: "necktie shirt" },
      { char: "👕", name: "t-shirt shirt clothing" },
      { char: "👖", name: "jeans pants" },
      { char: "🧣", name: "scarf" },
      { char: "🧤", name: "gloves" },
      { char: "🧥", name: "coat jacket" },
      { char: "🧦", name: "socks" },
      { char: "👗", name: "dress" },
      { char: "👘", name: "kimono" },
      { char: "🥻", name: "sari" },
      { char: "🩱", name: "one-piece swimsuit" },
      { char: "🩲", name: "briefs underwear" },
      { char: "🩳", name: "shorts" },
      { char: "👙", name: "bikini" },
      { char: "👚", name: "womans clothes" },
      { char: "🛍", name: "shopping bags" },
      { char: "🎒", name: "backpack school" },
      { char: "🧳", name: "luggage" },
      { char: "👞", name: "mans shoe" },
      { char: "👟", name: "sneaker athletic shoe" },
      { char: "🥾", name: "hiking boot" },
      { char: "🥿", name: "flat shoe" },
      { char: "👠", name: "high heel" },
      { char: "👡", name: "sandal" },
      { char: "🩰", name: "ballet shoes" },
      { char: "👢", name: "boot" },
      { char: "👑", name: "crown queen king" },
      { char: "👒", name: "womans hat" },
      { char: "🎩", name: "top hat" },
      { char: "🎓", name: "graduation cap" },
      { char: "🧢", name: "baseball cap" },
      { char: "⛑", name: "rescue helmet" },
      { char: "💄", name: "lipstick" },
      { char: "💍", name: "ring diamond" },
      { char: "🌂", name: "closed umbrella" },
      { char: "☂️", name: "umbrella" },
      { char: "🧣", name: "scarf" },
      { char: "🧤", name: "gloves" },
      { char: "📱", name: "mobile phone" },
      { char: "📲", name: "mobile phone arrow" },
      { char: "☎", name: "telephone" },
      { char: "📞", name: "phone receiver" },
      { char: "📟", name: "pager" },
      { char: "📠", name: "fax machine" },
      { char: "🔋", name: "battery" },
      { char: "🔌", name: "plug electric" },
      { char: "💻", name: "laptop computer" },
      { char: "🖥", name: "desktop computer" },
      { char: "🖨", name: "printer" },
      { char: "⌨", name: "keyboard" },
      { char: "🖱", name: "computer mouse" },
      { char: "🖲", name: "trackball" },
      { char: "💽", name: "minidisc" },
      { char: "💾", name: "floppy disk" },
      { char: "💿", name: "optical disk cd" },
      { char: "📀", name: "dvd" },
      { char: "📷", name: "camera" },
      { char: "📸", name: "camera flash" },
      { char: "📹", name: "video camera" },
      { char: "🎥", name: "movie camera" },
      { char: "📽", name: "film projector" },
      { char: "🎞", name: "film frames" },
      { char: "📺", name: "television" },
      { char: "📻", name: "radio" },
      { char: "🎙", name: "studio microphone" },
      { char: "🎚", name: "level slider" },
      { char: "🎛", name: "control knobs" },
      { char: "🧭", name: "compass" },
      { char: "⏱", name: "stopwatch" },
      { char: "⏲", name: "timer" },
      { char: "⏰", name: "alarm clock" },
      { char: "🕰", name: "mantel clock" },
      { char: "⌚", name: "watch" },
      { char: "📡", name: "satellite antenna" },
      { char: "🔋", name: "battery" },
      { char: "🔌", name: "plug" },
      { char: "💡", name: "light bulb idea" },
      { char: "🔦", name: "flashlight" },
      { char: "🕯", name: "candle" },
      { char: "🪔", name: "diya lamp" },
      { char: "🧯", name: "fire extinguisher" },
      { char: "🛢", name: "oil drum" },
      { char: "💸", name: "money wings" },
      { char: "💵", name: "dollar bill" },
      { char: "💴", name: "yen bill" },
      { char: "💶", name: "euro bill" },
      { char: "💷", name: "pound bill" },
      { char: "💰", name: "money bag" },
      { char: "🪙", name: "coin" },
      { char: "💳", name: "credit card" },
      { char: "💎", name: "gem stone diamond" },
      { char: "⚖", name: "balance scale" },
      { char: "🧰", name: "toolbox" },
      { char: "🔧", name: "wrench tool" },
      { char: "🔨", name: "hammer" },
      { char: "⚒", name: "hammer pick" },
      { char: "🛠", name: "hammer wrench" },
      { char: "⛏", name: "pick" },
      { char: "🪛", name: "screwdriver" },
      { char: "🔩", name: "nut bolt" },
      { char: "⚙", name: "gear" },
      { char: "🧱", name: "brick" },
      { char: "⛓", name: "chain" },
      { char: "🧲", name: "magnet" },
      { char: "🔫", name: "pistol water gun" },
      { char: "💣", name: "bomb" },
      { char: "🪃", name: "boomerang" },
      { char: "🏹", name: "bow arrow" },
      { char: "🛡", name: "shield" },
      { char: "🪄", name: "magic wand" },
      { char: "🔮", name: "crystal ball" },
      { char: "📿", name: "prayer beads" },
      { char: "🧿", name: "nazar amulet" },
      { char: "🪬", name: "hamsa" },
      { char: "🕸", name: "spider web" },
      { char: "🪰", name: "fly" },
      { char: "🪲", name: "beetle" },
      { char: "🪳", name: "cockroach" },
      { char: "🦠", name: "microbe germ" },
      { char: "💊", name: "pill medicine" },
      { char: "💉", name: "syringe" },
      { char: "🩸", name: "blood drop" },
      { char: "🩹", name: "adhesive bandage" },
      { char: "🩺", name: "stethoscope" },
      { char: "🩻", name: "x-ray" },
      { char: "🚪", name: "door" },
      { char: "🛏", name: "bed" },
      { char: "🛋", name: "couch sofa lamp" },
      { char: "🚽", name: "toilet" },
      { char: "🚿", name: "shower" },
      { char: "🛁", name: "bathtub" },
      { char: "🧴", name: "lotion bottle" },
      { char: "🧷", name: "safety pin" },
      { char: "🧹", name: "broom" },
      { char: "🧺", name: "basket" },
      { char: "🧻", name: "roll paper" },
      { char: "🪠", name: "plunger" },
      { char: "🧼", name: "soap" },
      { char: "🪥", name: "toothbrush" },
      { char: "🧽", name: "sponge" },
      { char: "🧯", name: "extinguisher" },
      { char: "🛒", name: "shopping cart" },
      { char: "🚬", name: "cigarette smoking" },
      { char: "⚰", name: "coffin" },
      { char: "🪦", name: "headstone" },
      { char: "⚱", name: "funeral urn" },
      { char: "🏺", name: "amphora vase" },
      { char: "🔔", name: "bell" },
      { char: "🔕", name: "bell slash" },
      { char: "🎵", name: "musical note" },
      { char: "🎶", name: "musical notes" },
      { char: "🗣", name: "speaking head" },
      { char: "👤", name: "bust silhouette" },
      { char: "👥", name: "busts silhouettes" },
      { char: "👣", name: "footprints" },
      { char: "🐾", name: "paw prints" },
      { char: "🫀", name: "anatomical heart" },
      { char: "🫁", name: "lungs" },
    ],
  },
  {
    key: "symbols",
    label: "符号",
    icon: "❤️",
    emojis: [
      { char: "❤️", name: "heart red love" },
      { char: "🧡", name: "heart orange" },
      { char: "💛", name: "heart yellow" },
      { char: "💚", name: "heart green" },
      { char: "💙", name: "heart blue" },
      { char: "💜", name: "heart purple" },
      { char: "🤎", name: "heart brown" },
      { char: "🖤", name: "heart black" },
      { char: "🤍", name: "heart white" },
      { char: "💔", name: "broken heart" },
      { char: "❣️", name: "heart exclamation" },
      { char: "💕", name: "two hearts" },
      { char: "💞", name: "revolving hearts" },
      { char: "💓", name: "beating heart" },
      { char: "💗", name: "growing heart" },
      { char: "💖", name: "sparkling heart" },
      { char: "💘", name: "heart arrow cupid" },
      { char: "💝", name: "gift heart" },
      { char: "💟", name: "heart decoration" },
      { char: "☮️", name: "peace symbol" },
      { char: "✝️", name: "latin cross christian" },
      { char: "☪️", name: "crescent islam" },
      { char: "🕉", name: "om hindu" },
      { char: "☸️", name: "wheel dharma" },
      { char: "✡️", name: "star david judaism" },
      { char: "🔯", name: "dotted six pointed" },
      { char: "🕎", name: "menorah" },
      { char: "☯️", name: "yin yang" },
      { char: "☦️", name: "orthodox cross" },
      { char: "🛐", name: "place worship" },
      { char: "⛎", name: "ophiuchus" },
      { char: "♈", name: "aries" },
      { char: "♉", name: "taurus" },
      { char: "♊", name: "gemini" },
      { char: "♋", name: "cancer" },
      { char: "♌", name: "leo" },
      { char: "♍", name: "virgo" },
      { char: "♎", name: "libra" },
      { char: "♏", name: "scorpio" },
      { char: "♐", name: "sagittarius" },
      { char: "♑", name: "capricorn" },
      { char: "♒", name: "aquarius" },
      { char: "♓", name: "pisces" },
      { char: "🆔", name: "id button" },
      { char: "⚛️", name: "atom symbol" },
      { char: "🉑", name: "accept ideograph" },
      { char: "☢", name: "radioactive" },
      { char: "☣", name: "biohazard" },
      { char: "📴", name: "mobile off" },
      { char: "📳", name: "vibration mode" },
      { char: "🈶", name: "have japanese" },
      { char: "🈚", name: "not free" },
      { char: "🈸", name: "application" },
      { char: "🈺", name: "open business" },
      { char: "🈷", name: "monthly amount" },
      { char: "✴️", name: "eight pointed star" },
      { char: "🆚", name: "versus" },
      { char: "💮", name: "white flower" },
      { char: "🉐", name: "bargain" },
      { char: "㊙️", name: "secret" },
      { char: "㊗️", name: "congratulations" },
      { char: "🈴", name: "passing grade" },
      { char: "🈵", name: "no vacancy" },
      { char: "🈹", name: "discount" },
      { char: "🈲", name: "prohibited" },
      { char: "🅰️", name: "a button blood" },
      { char: "🅱️", name: "b button" },
      { char: "🆎", name: "ab button" },
      { char: "🆑", name: "cl button" },
      { char: "🅾️", name: "o button" },
      { char: "🆘", name: "sos button" },
      { char: "❌", name: "cross mark x" },
      { char: "⭕", name: "hollow red circle o" },
      { char: "🛑", name: "stop sign" },
      { char: "⛔", name: "no entry" },
      { char: "📛", name: "name badge" },
      { char: "🚫", name: "prohibited no" },
      { char: "💯", name: "hundred points perfect" },
      { char: "💢", name: "anger symbol" },
      { char: "♨", name: "hot springs" },
      { char: "💦", name: "sweat droplets" },
      { char: "💨", name: "dashing away wind" },
      { char: "🕳", name: "hole" },
      { char: "💫", name: "dizzy star" },
      { char: "💥", name: "collision boom" },
      { char: "🔥", name: "fire flame hot" },
      { char: "✨", name: "sparkles" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glowing star" },
      { char: "💫", name: "star dizzy" },
      { char: "⚡", name: "high voltage lightning" },
      { char: "☄️", name: "comet" },
      { char: "☀️", name: "sun sunny" },
      { char: "🌤️", name: "sun small cloud" },
      { char: "⛅", name: "sun behind cloud" },
      { char: "🌥️", name: "sun large cloud" },
      { char: "☁️", name: "cloud" },
      { char: "🌦️", name: "sun rain cloud" },
      { char: "🌧️", name: "cloud rain" },
      { char: "⛈️", name: "cloud lightning rain" },
      { char: "🌩️", name: "cloud lightning" },
      { char: "🌨️", name: "cloud snow" },
      { char: "❄️", name: "snowflake" },
      { char: "☃️", name: "snowman" },
      { char: "⛄", name: "snowman without snow" },
      { char: "🌬️", name: "wind face" },
      { char: "🌀", name: "cyclone" },
      { char: "🌫️", name: "fog" },
      { char: "🌈", name: "rainbow" },
      { char: "🌂", name: "closed umbrella" },
      { char: "☂️", name: "umbrella" },
      { char: "☔", name: "umbrella rain" },
      { char: "⛱️", name: "beach umbrella" },
      { char: "✅", name: "check mark button white" },
      { char: "❎", name: "cross mark button" },
      { char: "✔️", name: "check mark" },
      { char: "❌", name: "cross mark" },
      { char: "➕", name: "plus" },
      { char: "➖", name: "minus" },
      { char: "➗", name: "divide" },
      { char: "✖️", name: "multiply" },
      { char: "🟰", name: "equal sign" },
      { char: "♾️", name: "infinity" },
      { char: "❓", name: "red question mark" },
      { char: "❔", name: "white question mark" },
      { char: "❕", name: "white exclamation" },
      { char: "❗", name: "red exclamation" },
      { char: "⁉️", name: "exclamation question" },
      { char: "🔃", name: "clockwise arrows" },
      { char: "🔄", name: "counterclockwise" },
      { char: "⏏️", name: "eject button" },
      { char: "⏯️", name: "play pause" },
      { char: "⏸️", name: "pause button" },
      { char: "⏹️", name: "stop button" },
      { char: "⏺️", name: "record button" },
      { char: "▶️", name: "play" },
      { char: "⏩", name: "fast forward" },
      { char: "⏪", name: "fast reverse" },
      { char: "⏫", name: "fast up" },
      { char: "⏬", name: "fast down" },
      { char: "◀️", name: "reverse" },
      { char: "🔼", name: "up button" },
      { char: "🔽", name: "down button" },
      { char: "➡️", name: "right arrow" },
      { char: "⬅️", name: "left arrow" },
      { char: "⬆️", name: "up arrow" },
      { char: "⬇️", name: "down arrow" },
      { char: "↗️", name: "up right arrow" },
      { char: "↘️", name: "down right arrow" },
      { char: "↙️", name: "down left arrow" },
      { char: "↖️", name: "up left arrow" },
      { char: "↕️", name: "up down arrow" },
      { char: "↔️", name: "left right arrow" },
      { char: "↩️", name: "right arrow curving left" },
      { char: "↪️", name: "left arrow curving right" },
      { char: "⤴️", name: "right arrow curving up" },
      { char: "⤵️", name: "right arrow curving down" },
      { char: "🔀", name: "shuffle" },
      { char: "🔁", name: "repeat" },
      { char: "🔂", name: "repeat single" },
      { char: "🔅", name: "dim button" },
      { char: "🔆", name: "bright button" },
      { char: "📶", name: "antenna bars" },
      { char: "📳", name: "vibration mode" },
      { char: "📴", name: "mobile phone off" },
    ],
  },
]

/**
 * 分类图标选择器：触发按钮 + 弹层（Notion 风格：搜索框 + 8 个 icon tab + 8 列大 emoji + 文本兜底）
 * - 触发按钮显示当前 emoji（大字号），未选时显示灰色 + 图标
 * - 弹层顶部：搜索框（按 name 关键词过滤）
 * - 弹层中部：8 个 icon tab（无文字，激活时蓝框）
 * - 弹层主区：8 列大 emoji 网格，hover 高亮，可滚动
 * - 文本输入可手动粘贴任意 emoji（受 zod 校验）
 * - 清除按钮把 icon 置空（hidden input value = ""）
 * - 表单提交走 name 字段
 */
export function EmojiPickerInput({
  name,
  id,
  defaultValue,
  disabled,
}: {
  name: string
  id?: string
  defaultValue?: string | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [emoji, setEmoji] = useState<string>(defaultValue ?? "")
  const [text, setText] = useState<string>(defaultValue ?? "")
  const [activeKey, setActiveKey] = useState<string>(GROUPS[0].key)
  const [query, setQuery] = useState("")
  const valid = isValidEmoji(text)

  // 搜索匹配：扁平化所有分组，按 name 关键词命中
  const filteredEmojis = useMemo(() => {
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    const items: EmojiItem[] = []
    if (!q) {
      const group = GROUPS.find((g) => g.key === activeKey) ?? GROUPS[0]
      for (const e of group.emojis) {
        if (!seen.has(e.char)) {
          seen.add(e.char)
          items.push(e)
        }
      }
      return { label: group.label, items }
    }
    for (const g of GROUPS) {
      for (const e of g.emojis) {
        if (e.name.toLowerCase().includes(q) && !seen.has(e.char)) {
          seen.add(e.char)
          items.push(e)
        }
      }
    }
    return { label: `搜索「${query}」`, items }
  }, [activeKey, query])

  function pick(char: string) {
    setEmoji(char)
    setText(char)
    setOpen(false)
  }

  function onTextChange(ev: ChangeEvent<HTMLInputElement>) {
    const v = ev.target.value
    setText(v)
    if (isValidEmoji(v)) setEmoji(v)
  }

  function clear() {
    setEmoji("")
    setText("")
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="选择图标"
            className={cn(
              "h-9 w-12 shrink-0 rounded-md border text-xl flex items-center justify-center transition-colors",
              "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              emoji ? "border-input bg-background" : "border-dashed text-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {emoji || <Smile className="size-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[26rem] max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
          align="start"
          sideOffset={6}
        >
          {/* 搜索栏 */}
          <div className="border-b px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 Emoji (英文)"
                className="h-7 pl-7 text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* icon tab（无文字，Notion 风格） */}
          <div className="flex items-center gap-0.5 border-b px-1.5 py-1 bg-muted/30 overflow-x-auto">
            {GROUPS.map((g) => {
              const active = !query && activeKey === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setActiveKey(g.key)
                    setQuery("")
                  }}
                  title={g.label}
                  aria-label={g.label}
                  aria-pressed={active}
                  className={cn(
                    "size-8 shrink-0 rounded-md text-base flex items-center justify-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/15 ring-1 ring-primary/40"
                      : "hover:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {g.icon}
                </button>
              )
            })}
          </div>

          {/* 当前分类 emoji 网格（8 列大 emoji，可滚动）
              max-h-72 (288px)：之前试过 max-h-[60vh]，移动端会把底部导航 Tab 也遮住
              overscroll-contain + touch-pan-y 防止滚动穿透到外层 dialog/page
              onTouchMove stopPropagation 避免冒泡触发 Radix Popover 的关闭逻辑 */}
          <div
            className="p-2 max-h-72 overflow-y-auto overscroll-contain touch-pan-y"
            key={query ? "search" : activeKey}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-popover">
              {filteredEmojis.label}
              <span className="ml-1.5 text-muted-foreground/60">
                {filteredEmojis.items.length}
              </span>
            </div>
            {filteredEmojis.items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                无匹配 emoji
              </p>
            ) : (
              <div
                className="grid grid-cols-8 gap-0.5"
                role="grid"
                aria-label={`${filteredEmojis.label} 表情`}
              >
                {filteredEmojis.items.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    onClick={() => pick(e.char)}
                    disabled={disabled}
                    title={e.name}
                    aria-label={`选择 ${e.char}`}
                    aria-pressed={emoji === e.char}
                    className={cn(
                      "size-9 rounded-md text-[22px] leading-none flex items-center justify-center transition-colors",
                      "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      emoji === e.char ? "bg-primary/15 ring-1 ring-primary/30" : "",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="text"
        value={text}
        onChange={onTextChange}
        placeholder="选或粘贴一个 Emoji"
        maxLength={16}
        disabled={disabled}
        className="w-40"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!valid}
      />

      {text && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="size-7 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
          aria-label="清除图标"
        >
          <X className="size-3.5" />
        </button>
      )}

      <input type="hidden" name={name} value={text} />
    </div>
  )
}
