import { useColorScheme } from "@/hooks/useColorScheme";
import { Image } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";

const nequiXml = (bodyColor: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.15 30"><path fill="#ca0080" d="M8.38,3.86h-3.93c-.46,0-.83.37-.83.83v3.34c0,.46.37.83.83.83h3.93c.46,0,.83-.37.83-.83v-3.34c0-.46-.37-.83-.83-.83Z"/><path fill="${bodyColor}" d="M32.4,3.86h-3.39c-.46,0-.83.38-.83.83v13.55c0,.28-.36.38-.49.13l-7.88-14.15c-.13-.23-.36-.36-.64-.36h-5.64c-.46,0-.83.38-.83.83v21.65c0,.46.38.83.83.83h3.39c.46,0,.83-.38.83-.83v-13.96c0-.28.36-.38.49-.13l8.1,14.57c.13.23.36.36.64.36h5.39c.46,0,.83-.38.83-.83V4.68c0-.46-.38-.83-.83-.83h.03Z"/></svg>`;

const daviplataXml = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 41" fill="none"><path d="M12.3535 17.4629C12.3776 17.3699 12.3937 17.2787 12.4104 17.1876C12.4271 17.1048 12.4431 17.0226 12.4561 16.9366C12.5 16.6073 12.5081 16.2934 12.4846 15.9988C12.4827 15.9815 12.4802 15.9642 12.4784 15.9468C12.471 15.8653 12.4574 15.7864 12.445 15.7068C12.3553 15.1939 12.2008 14.7285 11.9874 14.31C11.9825 14.3004 11.9769 14.2927 11.9726 14.2831C11.9163 14.1752 11.8557 14.0725 11.792 13.9711C11.7494 13.9031 11.7073 13.8383 11.6634 13.776C11.6344 13.7336 11.6034 13.6913 11.5731 13.6502C11.5107 13.5648 11.4495 13.4859 11.3889 13.4127C11.3209 13.3325 11.2522 13.2522 11.1805 13.1765C11.165 13.1604 11.1508 13.1437 11.1354 13.129C8.38623 10.3092 2.39762 10.5974 0.68606 11.3465C-0.471469 11.8516 -0.0720232 13.3414 1.19557 12.7599C3.25773 12.2182 5.24692 12.2291 7.28249 12.7599C8.94397 13.1925 10.6858 14.7022 10.6858 16.3236C10.5671 20.361 5.42191 20.5215 3.33626 19.9958V14.9731C3.33626 13.7741 1.84915 13.7644 1.84915 14.9635V20.0138C1.84915 21.0273 2.3531 21.3951 3.01905 21.5536C4.58963 21.9266 11.1811 22.3252 12.3522 17.4629H12.3535Z" fill="${color}"/><path d="M40.1317 20.7905V11.9357C40.1311 10.5358 38.4368 10.5435 38.4368 11.9126V20.7404C38.4368 22.0639 40.1317 22.114 40.1317 20.7905Z" fill="${color}"/><path d="M35.8887 11.4254C35.1491 13.6104 32.6127 19.7115 31.0768 19.7275C29.539 19.7429 26.9166 13.6951 26.1362 11.5243C25.6675 10.2232 24.2367 11.1687 24.7042 12.4698C25.5433 14.8043 28.6955 21.8444 31.1108 21.7565C33.5241 21.795 36.5423 14.6913 37.3387 12.3408C37.7814 11.0307 36.3351 10.1147 35.8881 11.4254H35.8887Z" fill="${color}"/><path d="M19.4786 10.8452C16.8649 10.7682 13.4912 17.8192 12.5971 20.1576C12.095 21.4619 13.6483 22.3996 14.1504 21.096C14.9808 18.9239 17.8177 12.8658 19.4817 12.8748C21.1432 12.8851 23.8855 18.9765 24.6955 21.157C25.1815 22.4664 26.7447 21.5466 26.2574 20.2365C25.3881 17.8885 22.0886 10.7983 19.4786 10.8445V10.8452Z" fill="${color}"/><path d="M47.1857 11.4839C45.9682 10.419 43.9963 8.88103 43.1331 8.21412C43.2259 7.25259 43.3934 6.23457 43.6012 5.37959C43.8621 4.31792 44.0847 3.11119 43.4182 2.22026C42.9717 1.62395 42.2662 1.33382 41.2614 1.33382H37.795C36.8292 1.33382 36.1113 1.64513 35.6624 2.25813C35.4806 2.50654 35.3557 2.79217 35.2895 3.10605C31.6951 1.13484 28.6554 0.00962818 26.8659 0C23.8366 0.016047 16.6355 3.64138 10.4719 8.25392C10.2344 8.43172 10.1813 8.77512 10.3519 9.02096C10.5226 9.2668 10.854 9.32265 11.0908 9.14549C17.7101 4.19147 24.4358 1.11173 26.8659 1.0989C28.5774 1.10852 31.8175 2.37559 35.5325 4.4893L36.4569 5.01564L36.311 3.93151C36.256 3.52006 36.3227 3.17152 36.5052 2.92247C36.7432 2.59704 37.1767 2.43208 37.7944 2.43208H41.2608C41.9169 2.43208 42.3491 2.58292 42.5816 2.89359C42.955 3.39233 42.7831 4.26015 42.5741 5.10871C42.3311 6.11197 42.1401 7.32063 42.0504 8.42466L42.0257 8.73019L42.2631 8.91249C42.9229 9.41957 45.1773 11.1642 46.5031 12.3241C48.4892 14.0616 49.2844 15.6509 48.8033 16.9193C48.2839 18.2878 46.1976 19.1145 43.6074 18.9771C43.2729 18.9605 42.9421 18.9438 42.6168 18.9264L42.0183 18.895L42.0622 19.5157C42.1735 21.0992 42.7207 23.5634 44.6926 26.3106L44.7105 26.3344C46.8085 28.9423 47.1257 32.0901 45.5595 34.7532C43.6989 37.9164 39.0601 40.4769 32.8897 39.0667L32.75 39.0346L32.6139 39.0801C30.822 39.6777 28.1403 39.9005 26.8708 39.9005C25.6014 39.9005 22.919 39.6777 21.1289 39.0801L20.9929 39.0346L20.8532 39.0667C14.6815 40.4769 10.0415 37.9158 8.18094 34.7526C6.61469 32.0894 6.93189 28.9423 9.02991 26.3344C9.21727 26.1014 9.18759 25.7547 8.96313 25.5603C8.73868 25.3658 8.40478 25.3966 8.21742 25.6296C5.81518 28.6162 5.46334 32.2409 7.27754 35.3252C9.34484 38.8851 13.9486 40.9397 19.9021 40.9397C20.8981 40.9397 21.9257 40.8706 22.9641 40.7165C24.1718 40.9455 25.5536 41 26.8714 41C28.1893 41 29.5711 40.9455 30.7788 40.7165C31.8172 40.8706 32.8448 40.9397 33.8408 40.9397C39.7943 40.9397 44.3987 38.8851 46.4635 35.3258C48.2752 32.2454 47.9271 28.6259 45.5335 26.3306L45.5156 26.3068C43.5437 23.5596 42.9952 21.0954 42.8852 19.5119C43.1547 19.526 43.4274 19.5414 43.7051 19.5567C46.7177 19.7184 49.3011 18.6944 50 16.8615C50.6335 15.1791 49.5848 13.1431 47.1863 11.4839H47.1857Z" fill="${color}"/><path d="M14.3365 35.1794V32.3083C14.739 32.4027 15.1416 32.4431 15.5441 32.4431C17.4789 32.4431 19.0241 31.2974 19.0241 28.588C19.0241 26.1752 17.8425 25.0833 16.3752 25.0833C15.4792 25.0833 14.7131 25.5551 14.2066 26.2695C14.1287 25.8786 14.0119 25.5551 13.8171 25.2316H13.012C13.0899 26.1213 13.1029 26.8357 13.1029 27.5231V35.1794H14.3365ZM14.3365 26.8215C14.8559 26.498 15.4792 26.2554 16.0635 26.2554C17.1413 26.2554 17.8165 26.8485 17.8165 28.6817C17.8165 30.8249 16.7387 31.3641 15.5571 31.3641C15.1935 31.3641 14.765 31.3237 14.3365 31.2024V26.8215Z" fill="${color}"/><path d="M20.2892 22.1981V30.5284C20.2892 31.9707 20.9515 32.456 21.9124 32.456C22.224 32.456 22.5746 32.4155 22.9642 32.3077V31.2158C22.6525 31.2698 22.3928 31.3237 22.198 31.3237C21.7046 31.3237 21.5228 31.0676 21.5228 30.3397V22.1981H20.2892Z" fill="${color}"/><path d="M23.6103 30.7447C23.6103 31.9039 24.4024 32.4431 25.3503 32.4431C26.3891 32.4431 27.2202 31.877 27.5838 30.8391C27.6617 31.4591 27.8045 31.85 27.9863 32.2948H28.7914C28.6745 31.3378 28.6615 30.7043 28.6615 30.0438V27.9814C28.6615 25.9191 27.5318 25.0833 25.9217 25.0833C25.3114 25.0833 24.6362 25.2046 23.922 25.4338V26.5526C24.5582 26.4043 25.2075 26.256 25.7918 26.256C26.7008 26.256 27.4929 26.5526 27.5059 27.8197C26.3891 28.7632 23.6103 28.4128 23.6103 30.7447ZM27.5059 28.8171V29.3294C27.5059 30.583 26.48 31.4052 25.61 31.4052C25.1036 31.4052 24.779 31.1491 24.779 30.6234C24.779 29.3294 26.3891 29.6259 27.5059 28.8171Z" fill="${color}"/><path d="M32.7908 32.4431C33.3102 32.4431 33.8815 32.3353 34.5308 32.1331V31.0278C33.9595 31.1895 33.4401 31.2704 33.0115 31.2704C32.2065 31.2704 31.726 30.9065 31.726 29.7203V26.2426H34.388V25.2316H31.726V23.2097H30.5574V25.2855C30.0769 25.3529 29.6354 25.4608 29.2848 25.5956V26.2426H30.4924V29.7068C30.4924 31.6074 31.3235 32.4431 32.7908 32.4431Z" fill="${color}"/><path d="M35.5238 25.4332V26.552C36.1601 26.4037 36.8094 26.2554 37.3937 26.2554C38.3027 26.2554 39.0948 26.552 39.1077 27.819C37.991 28.7626 35.2122 28.4121 35.2122 30.7441C35.2122 31.9033 36.0043 32.4425 36.9522 32.4425C37.991 32.4425 38.8221 31.8763 39.1857 30.8384C39.2636 31.4585 39.4064 31.8494 39.5882 32.2942H40.3933C40.2764 31.3372 40.2634 30.7036 40.2634 30.0431V27.9808C40.2634 25.9184 39.1337 25.0827 37.5236 25.0827C36.9133 25.0827 36.238 25.204 35.5238 25.4332ZM39.1084 29.3294C39.1084 30.5829 38.0825 31.4052 37.2125 31.4052C36.7061 31.4052 36.3815 31.1491 36.3815 30.6234C36.3815 29.3294 37.9916 29.6259 39.1084 28.8171V29.3294Z" fill="${color}"/></svg>`;

const puntosColombiaXml = (textColor: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54.25 19.66"><path fill="#5e00cc" d="M8.82.17C4.25.08.51,3.72.43,8.25h0v10.75c0,.27.22.48.48.48h4.02c.27,0,.48-.22.48-.48v-2.71c0-.15.15-.26.3-.2.91.35,1.9.54,2.94.54,4.58,0,8.29-3.75,8.23-8.35C16.82,3.86,13.23.25,8.82.17Z"/><path fill="#fff" d="M5.87,11.51c-.72-.77-1.08-1.81-1.08-3.12s.37-2.34,1.11-3.12c.74-.77,1.74-1.16,3.01-1.16.99,0,1.81.28,2.47.84.65.57,1.03,1.31,1.14,2.23h-1.82c-.22-.96-.9-1.55-1.88-1.55-.67,0-1.2.25-1.6.76-.39.51-.59,1.17-.59,1.99s.19,1.48.58,1.99c.39.51.92.76,1.58.76,1,0,1.69-.59,1.91-1.55h1.81c-.1.92-.49,1.66-1.16,2.22-.67.57-1.53.85-2.55.85-1.24,0-2.22-.39-2.93-1.16Z"/><path fill="${textColor}" d="M19.96,15.59c-.32-.35-.49-.82-.49-1.41s.17-1.05.5-1.41c.33-.35.78-.53,1.34-.53.43,0,.8.12,1.09.36s.47.56.53.97h-.65c-.13-.49-.49-.78-1-.78-.36,0-.64.13-.85.38-.21.26-.32.59-.32,1.01s.1.75.31,1c.21.26.49.39.84.39.52,0,.89-.29,1.01-.78h.65c-.06.4-.24.72-.54.97-.3.24-.67.36-1.12.36-.55,0-.99-.18-1.32-.53h0Z"/><path fill="${textColor}" d="M24.65,16.12c-.43,0-.77-.13-1.03-.39-.26-.26-.39-.6-.39-1.03s.13-.77.39-1.04c.26-.26.6-.39,1.03-.39s.77.13,1.03.4c.26.26.39.61.39,1.03s-.13.77-.39,1.03c-.26.26-.61.39-1.03.39h0ZM24.65,15.62c.24,0,.44-.09.6-.26.15-.17.23-.39.23-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.6-.26s-.44.08-.59.26c-.15.17-.23.39-.23.67s.07.49.23.67c.15.17.35.26.59.26h0Z"/><path fill="${textColor}" d="M26.49,16.09v-3.82h.59v3.82h-.59Z"/><path fill="${textColor}" d="M28.92,16.12c-.43,0-.77-.13-1.03-.39-.26-.26-.39-.6-.39-1.03s.13-.77.39-1.04c.26-.26.6-.39,1.03-.39s.77.13,1.03.4c.26.26.39.61.39,1.03s-.13.77-.39,1.03c-.26.26-.61.39-1.03.39h0ZM28.92,15.62c.24,0,.44-.09.6-.26.15-.17.23-.39.23-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.6-.26s-.44.08-.59.26c-.15.17-.23.39-.23.67s.07.49.23.67c.15.17.35.26.59.26h0Z"/><path fill="${textColor}" d="M35.02,14.48v1.61h-.59v-1.57c0-.49-.2-.75-.58-.75-.2,0-.36.07-.48.22-.12.14-.18.34-.18.59v1.51h-.59v-1.57c0-.49-.2-.75-.59-.75-.2,0-.36.07-.48.22s-.18.35-.18.6v1.49h-.59v-2.79h.51l.07.37c.2-.26.47-.4.82-.4.38,0,.7.17.86.51.19-.32.51-.51.96-.51.58,0,1.05.33,1.05,1.22h0Z"/><path fill="${textColor}" d="M37.95,13.65c.24.26.36.6.36,1.05s-.12.77-.37,1.03c-.25.26-.56.39-.95.39s-.71-.15-.91-.44l-.07.4h-.51v-3.82h.59v1.44c.22-.3.52-.45.9-.45s.71.13.95.38h0ZM37.49,15.37c.15-.17.22-.4.22-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.59-.26s-.44.08-.59.26c-.15.17-.22.39-.22.67s.07.5.22.68c.15.17.35.26.59.26s.44-.08.59-.26h0Z"/><path fill="${textColor}" d="M39.03,12.91c-.1,0-.19-.03-.26-.1-.07-.07-.1-.15-.1-.25s.03-.19.1-.26c.07-.07.15-.1.26-.1s.19.03.26.1c.07.07.1.15.1.26s-.03.19-.1.25c-.07.07-.15.1-.26.1ZM38.73,16.09v-2.79h.59v2.79h-.59Z"/><path fill="${textColor}" d="M42.51,15.57v.51h-.31c-.36,0-.51-.16-.51-.45-.21.32-.52.48-.92.48-.31,0-.56-.07-.75-.22-.19-.14-.28-.34-.28-.6,0-.57.42-.89,1.19-.89h.7v-.17c0-.31-.23-.5-.61-.5-.34,0-.59.16-.63.41h-.58c.03-.27.15-.49.38-.65.22-.16.51-.24.86-.24.75,0,1.17.36,1.17,1.01v1.12c0,.14.05.18.18.18h.12ZM41.63,14.85h-.73c-.38,0-.57.14-.57.42,0,.24.2.4.52.4.24,0,.43-.07.57-.2.14-.13.21-.3.21-.52v-.1h0Z"/><path fill="${textColor}" d="M29.92,8.01c0,.96-.34,1.43-1.12,1.43s-1.12-.47-1.12-1.43v-3.08h-1.58v3.08c0,2.04,1.1,2.73,2.7,2.73s2.7-.69,2.7-2.73v-3.08h-1.58v3.08h0Z"/><path fill="${textColor}" d="M22.44,2.84h-2.97v7.84h1.68v-2.41h1.29c1.77,0,2.94-1.06,2.94-2.71s-1.17-2.72-2.94-2.72h0ZM22.28,6.87h-1.13v-2.63h1.13c.85,0,1.4.5,1.4,1.32s-.55,1.31-1.4,1.31Z"/><path fill="${textColor}" d="M35.56,4.86c-.89,0-1.41.34-1.78.79l-.15-.72h-1.38v5.76h1.58v-2.95c0-1,.47-1.58,1.29-1.58s1.17.52,1.17,1.49v3.04h1.58v-3.19c0-1.97-1.06-2.63-2.31-2.63h0Z"/><path fill="${textColor}" d="M40.69,8.78v-2.52h1.32v-1.33h-1.32v-1.61h-1.58v1.61h-.95v1.33h.95v2.78c0,1.1.55,1.65,1.65,1.65h1.29v-1.33h-.78c-.41,0-.57-.17-.57-.57Z"/><path fill="${textColor}" d="M51.65,7.14c-.83-.1-1.32-.15-1.32-.58,0-.37.4-.59,1.02-.59s1.08.28,1.12.74h1.51c-.08-1.18-1.14-1.86-2.69-1.86-1.48-.01-2.48.74-2.48,1.88s1.04,1.49,2.39,1.65c.93.12,1.32.16,1.32.63,0,.4-.4.62-1.06.62-.77,0-1.21-.35-1.27-.85h-1.5c.07,1.23,1.15,1.98,2.76,1.98s2.62-.73,2.62-1.87c0-1.3-1.1-1.6-2.42-1.74h0Z"/><path fill="${textColor}" d="M45.34,10.79c-.92,0-1.66-.27-2.21-.81-.55-.54-.84-1.25-.84-2.14s.28-1.6.84-2.15c.55-.54,1.29-.81,2.21-.81s1.66.27,2.22.81c.55.54.83,1.26.83,2.15s-.27,1.61-.83,2.15c-.55.54-1.3.81-2.22.81ZM45.34,9.5c.44,0,.79-.15,1.05-.46.26-.31.39-.71.39-1.2s-.13-.9-.39-1.2c-.26-.31-.62-.46-1.05-.46s-.79.15-1.04.46c-.26.31-.38.71-.38,1.2s.13.9.38,1.2c.26.31.6.46,1.04.46Z"/></svg>`;

const bancolombiaXml = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110.54 110.83"><path fill="${color}" d="M82.66.03c-21.47,2.65-42.21,6.56-63,12.59-2.71.85-4.37,3.88-3.69,6.57,1.52,5.99,2.29,8.99,3.83,15,.65,2.54,3.21,3.84,5.8,2.98,21.24-6.54,42.53-11.01,64.51-14.27,2.52-.34,3.89-2.94,2.97-5.55-1.95-5.51-2.93-8.25-4.92-13.73-.86-2.32-3.15-3.85-5.5-3.59ZM100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34-2.26,1.07-3.62,3.92-3.14,6.43,1.22,6.42,1.83,9.64,3.07,16.07.53,2.75,3.1,4.02,5.63,2.78,31.53-14.45,64.84-23.64,99.01-29.12,2.17-.36,3.28-2.85,2.45-5.41-1.72-5.32-2.59-7.98-4.37-13.27-.81-2.46-3.04-4.11-5.26-3.82ZM100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03-2.58.95-4.03,3.66-3.35,6.17,1.62,5.96,2.42,8.95,4.06,14.93.77,2.81,3.93,4.25,6.83,3.14,20.31-7.28,40.83-13.63,61.79-18.73,2.01-.49,3-2.85,2.26-5.28-1.65-5.37-2.48-8.05-4.18-13.39-.83-2.63-3.27-4.35-5.58-3.87Z"/></svg>`;

const pseXml = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38"><path fill="${color}" d="M12.17,15.02h0s.54.01.54.01l.07-.4h-.73l-.05.2s0,.09.03.12.07.06.12.06Z"/><path fill="${color}" d="M28.26,16.97h.01s-2.23.01-2.23.01c-.42,0-.77.29-.85.7l-.27,1.46h3.97l.23-1.14c.05-.25-.01-.51-.18-.71-.17-.2-.41-.32-.67-.32Z"/><path fill="${color}" d="M15.11,16.98h-1.93c-.5,0-.92.35-1.01.84l-.15.79-.46,2.53c-.06.29.02.6.22.84.19.24.48.36.78.36h1.94c.5,0,.92-.35,1.01-.84l.6-3.32c.06-.29-.02-.6-.22-.84-.19-.24-.48-.36-.78-.36Z"/><path fill="${color}" d="M18.99,3.85c-6.1,0-11.39,3.46-14.03,8.51.37.02.68.33.68.71s-.32.73-.73.73c-.22,0-.4-.1-.53-.25-.15.33-.26.68-.38,1.03l-.03.09c.18.14.29.33.29.57,0,.37-.29.68-.66.7-.1.41-.18.83-.25,1.25h2.02l1.67,2.04h3.28v.57h-1.69l-1.29,2.32h-1.76c-.11.26-.36.44-.66.44-.4,0-.73-.32-.73-.73s.32-.73.73-.73c.29,0,.56.18.66.44h1.43l.97-1.76H3.17c0,1.2.16,2.37.43,3.5.26.1.45.36.45.67,0,.17-.07.32-.16.44.14.45.31.9.49,1.33.14-.17.33-.28.56-.28.4,0,.73.32.73.73s-.32.73-.73.73h-.01c2.63,5.11,7.93,8.61,14.08,8.61,8.74,0,15.83-7.08,15.83-15.83S27.74,3.85,18.99,3.85ZM6.27,15.97c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM6.36,24.7c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM14.64,13.31c.01-.06.07-.1.14-.09.06.01.1.07.09.14l-.09.49s.06-.03.09-.03h.36c.11,0,.23.05.29.14s.1.2.08.32l-.17.91s-.06.09-.11.09h-.02c-.06-.01-.1-.07-.09-.14l.17-.91s0-.09-.03-.12-.07-.06-.12-.06h-.36c-.08,0-.14.06-.15.12l-.19,1.01c-.01.06-.07.1-.14.09-.06-.01-.1-.07-.09-.14l.16-.8.19-1.01ZM13.22,14.11h.01c.03-.17.19-.31.37-.31h.62c.07,0,.11.05.11.11s-.05.11-.11.11h-.62c-.08,0-.14.06-.15.12l-.14.68s0,.09.03.12.07.06.11.06h.6c.07,0,.11.05.11.11s-.05.11-.11.11h-.6c-.11,0-.23-.05-.29-.14-.07-.09-.1-.2-.08-.32l.12-.68ZM11.84,14.58c.02-.09.1-.16.19-.16h.79l.03-.19s0-.09-.03-.12-.07-.06-.11-.06h-.6c-.07,0-.11-.05-.11-.11s.05-.11.11-.11h.6c.11,0,.23.05.29.14.07.09.1.2.08.32l-.05.23-.14.75h-.74c-.11.01-.23-.03-.29-.12s-.1-.2-.08-.32l.05-.23ZM14.53,23.5h-.01s-1.94-.01-1.94-.01c-.5,0-.96-.17-1.34-.48l-.57,3.09c-.05.27-.28.46-.56.46h-.1c-.31-.06-.51-.35-.45-.66l.91-4.95.6-3.32c.18-1.02,1.08-1.77,2.12-1.77h1.94c.65,0,1.25.28,1.65.77.41.49.58,1.13.46,1.77l-.6,3.32c-.18,1.02-1.08,1.77-2.12,1.77ZM19.15,19.01h2.31c.6,0,1.73.45,1.73,2.15,0,1.37-1.48,2.37-2.12,2.37h-3.85c-.32,0-.57-.25-.57-.57s.25-.57.57-.57h3.85c.17-.05.99-.61.99-1.24,0-.96-.5-1.02-.6-1.02h-2.31c-.68,0-1.69-.54-1.69-2.06,0-1.43,1.36-2.22,2.3-2.22h3.07c.32,0,.57.25.57.57s-.25.57-.57.57h-3.07c-.33,0-1.17.33-1.17,1.09,0,.92.56.93.56.93ZM29.98,19.46h0c-.09.5-.52.84-1.01.84h-4.27l-.22,1.07c-.05.25.01.51.18.71s.41.32.67.32h3.21c.32,0,.57.25.57.57s-.25.57-.57.57h-3.21c-.6,0-1.16-.26-1.54-.73-.39-.46-.53-1.07-.42-1.65l.24-1.22.02-.05.43-2.38c.17-.95,1-1.64,1.96-1.64h2.23c.6,0,1.16.26,1.54.73.39.46.53,1.07.42,1.65l-.24,1.22Z"/><path fill="${color}" d="M5.12,17.77h-1.82c-.06.49-.09.97-.1,1.47h3.13l-1.2-1.47Z"/></svg>`;
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCOP } from "@/utils/format";
import { isNfcSupported, scanBraceletUID } from "@/utils/nfc";
import { PhoneInput, COUNTRY_CODES, type CountryCode } from "@/components/PhoneInput";
import { useInitiateTopUp, useMyBracelets, usePseBanks, useSavedCards, useSaveCard, type SavedCard } from "@/hooks/useAttendeeApi";
import { useTokenizeCard } from "@/hooks/useEventsApi";

type DigitalMethod = "nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia";
type LegalIdType = "CC" | "CE" | "NIT" | "PP" | "TI";

type CardBrand = "visa" | "mastercard" | "amex" | null;

function detectCardBrand(raw: string): CardBrand {
  const n = raw.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7]\d{2})/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  return null;
}

function formatCardNumber(raw: string, brand: CardBrand): string {
  const digits = raw.replace(/\D/g, "");
  if (brand === "amex") {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(" ");
  }
  return (digits.match(/.{1,4}/g) ?? []).join(" ").slice(0, 19);
}

function handleExpiryChange(value: string, prev: string): string {
  let v = value.replace(/[^\d/]/g, "");
  if (v.length === 2 && !v.includes("/") && prev.length === 1) v = v + "/";
  const parts = v.split("/");
  if (parts[1] && parts[1].length === 4) v = parts[0] + "/" + parts[1].slice(2);
  return v.slice(0, 5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CARD_LOGOS: Record<NonNullable<CardBrand>, any> = {
  visa: require("@/assets/images/card-visa.png"),
  mastercard: require("@/assets/images/card-mastercard.png"),
  amex: require("@/assets/images/card-amex.png"),
};

function CardBrandLogo({ brand }: { brand: CardBrand }) {
  if (!brand) return null;
  return (
    <Image
      source={CARD_LOGOS[brand]}
      style={{ width: 44, height: 28 }}
      contentFit="contain"
    />
  );
}

const LEGAL_ID_TYPES: { code: LegalIdType; label: string }[] = [
  { code: "CC", label: "Cédula de Ciudadanía" },
  { code: "CE", label: "Cédula de Extranjería" },
  { code: "NIT", label: "NIT" },
  { code: "PP", label: "Pasaporte" },
  { code: "TI", label: "Tarjeta de Identidad" },
];

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

function collectBrowserInfo() {
  const screen = Dimensions.get("screen");
  return {
    browser_color_depth: "24",
    browser_screen_height: String(Math.round(screen.height)),
    browser_screen_width: String(Math.round(screen.width)),
    browser_language: "es-CO",
    browser_user_agent: Platform.OS === "ios"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      : Platform.OS === "android"
      ? "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36"
      : "Mozilla/5.0",
    browser_tz: String(-new Date().getTimezoneOffset()),
  };
}

function normalizeUid(raw: string): string {
  const clean = raw.replace(/[:\s\-]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  return clean.match(/.{1,2}/g)?.join(":") ?? clean;
}

export default function TopUpScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const params = useLocalSearchParams<{ braceletUid?: string; preload?: string }>();
  const isPreload = params.preload === "true";
  const [braceletUid, setBraceletUid] = useState(params.braceletUid ?? "");

  const { data } = useMyBracelets();
  type Bracelet = { uid: string; balance: number; flagged: boolean; pendingRefund?: boolean; refundStatus?: string | null; event?: { name: string } | null };
  const allBracelets = ((data as { bracelets?: Bracelet[] } | undefined)?.bracelets ?? []);
  const bracelets = allBracelets; // show all, but disable ones with pending refund
  const isSelectedFromList = braceletUid.length > 0 && allBracelets.some((b) => b.uid === braceletUid && !b.pendingRefund);

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<DigitalMethod>("nequi");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [legalIdType, setLegalIdType] = useState<LegalIdType>("CC");
  const [legalId, setLegalId] = useState("");
  const [showLegalIdTypePicker, setShowLegalIdTypePicker] = useState(false);
  const [pseUserType, setPseUserType] = useState<0 | 1>(0);
  const [showPseUserTypePicker, setShowPseUserTypePicker] = useState(false);
  const [pseEmail, setPseEmail] = useState("");

  const { data: pseBanksRaw, isPending: pseBanksLoading, isError: pseBanksError, refetch: refetchPseBanks } = usePseBanks();
  const pseBanks = (pseBanksRaw ?? []).map((b) => ({
    code: b.financial_institution_code,
    name: b.financial_institution_name,
  }));

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");

  const { mutate: initiatePayment, isPending } = useInitiateTopUp();
  const { mutateAsync: tokenizeCard, isPending: isTokenizing } = useTokenizeCard();

  const { data: savedCardsData } = useSavedCards();
  const savedCards = savedCardsData?.cards ?? [];
  const { mutateAsync: saveCardMutation } = useSaveCard();

  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  const [pendingCardSave, setPendingCardSave] = useState<{
    wompiToken: string; brand: string; lastFour: string; cardHolderName: string; expiryMonth: string; expiryYear: string;
  } | null>(null);
  const [saveAlias, setSaveAlias] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingRoute, setPendingRoute] = useState<any>(null);

  useEffect(() => {
    setNfcAvailable(isNfcSupported());
  }, []);

  const handleNfcScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const uid = await scanBraceletUID();
      if (uid) setBraceletUid(uid);
    } finally {
      setScanning(false);
    }
  };

  const effectiveAmount = selectedAmount ?? (customAmount ? parseInt(customAmount.replace(/\D/g, ""), 10) : 0);

  const usingNewCard = method === "card" && (savedCards.length === 0 || showNewCardForm || selectedSavedCardId === null);

  const canSubmit =
    effectiveAmount >= 1000 &&
    (isPreload || braceletUid.length > 0) &&
    (method === "nequi" || method === "daviplata"
      ? phoneNumber.replace(/\D/g, "").length >= 10
      : method === "puntoscolombia"
      ? phoneNumber.replace(/\D/g, "").length >= 10 && legalId.trim().length >= 5
      : method === "pse"
      ? selectedBank !== null && legalId.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pseEmail.trim())
      : method === "card"
      ? (selectedSavedCardId !== null && !showNewCardForm) || (cardNumber.replace(/\s/g, "").length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= (detectCardBrand(cardNumber) === "amex" ? 4 : 3) && cardHolder.trim().length > 0)
      : true);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body: Parameters<typeof initiatePayment>[0] = {
      ...(isPreload ? {} : { braceletUid }),
      amount: effectiveAmount,
      paymentMethod: method,
    };

    let newCardData: typeof pendingCardSave = null;

    if (method === "nequi" || method === "daviplata") {
      body.phoneNumber = phoneNumber.replace(/\D/g, "");
    } else if (method === "puntoscolombia") {
      body.phoneNumber = phoneNumber.replace(/\D/g, "");
      body.userLegalIdType = legalIdType;
      body.userLegalId = legalId.trim();
    } else if (method === "pse") {
      body.bankCode = selectedBank!.code;
      body.userLegalIdType = legalIdType;
      body.userLegalId = legalId.trim();
      body.pseUserType = pseUserType;
      body.pseEmail = pseEmail.trim();
    } else if (method === "card") {
      body.browserInfo = collectBrowserInfo();
      if (selectedSavedCardId && !showNewCardForm) {
        body.savedCardId = selectedSavedCardId;
        body.installments = 1;
      } else {
        try {
          const [expMonth, expYear] = cardExpiry.split("/");
          const tokenResult = await tokenizeCard({
            number: cardNumber.replace(/\s/g, ""),
            cvc: cardCvc,
            expMonth: expMonth?.trim() ?? "",
            expYear: expYear?.trim() ?? "",
            cardHolder: cardHolder.trim(),
          });
          body.cardToken = tokenResult;
          body.installments = 1;
          const brand = detectCardBrand(cardNumber) ?? "card";
          newCardData = {
            wompiToken: tokenResult,
            brand: brand ?? "card",
            lastFour: cardNumber.replace(/\s/g, "").slice(-4),
            cardHolderName: cardHolder.trim(),
            expiryMonth: expMonth?.trim() ?? "",
            expiryYear: expYear?.trim() ?? "",
          };
        } catch (err) {
          const msg = (err as { message?: string }).message ?? t("common.unknownError");
          showAlert(t("common.error"), msg);
          return;
        }
      }
    }

    initiatePayment(body, {
      onSuccess: (result) => {
        const targetRoute = {
          pathname: "/payment-status/[id]" as const,
          params: {
            id: result.intentId,
            redirectUrl: result.redirectUrl ?? "",
            paymentMethod: method,
            purposeType: result.purposeType ?? "topup",
          },
        };
        if (newCardData) {
          setPendingCardSave(newCardData);
          setSaveAlias("");
          setPendingRoute(targetRoute);
        } else {
          router.push(targetRoute);
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string }).message ?? t("common.unknownError");
        showAlert(t("common.error"), msg);
      },
    });
  };

  const handleSaveCard = async () => {
    if (pendingCardSave) {
      setSavingCard(true);
      try {
        await saveCardMutation({ ...pendingCardSave, alias: saveAlias.trim() || undefined });
      } catch {
      }
      setSavingCard(false);
    }
    setPendingCardSave(null);
    if (pendingRoute) {
      router.push(pendingRoute);
    }
  };

  const handleSkipSave = () => {
    setPendingCardSave(null);
    if (pendingRoute) {
      router.push(pendingRoute);
    }
  };

  if (pendingCardSave) {
    return (
      <View style={[{ flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <View style={[{ width: "100%", maxWidth: 360, backgroundColor: C.card, borderRadius: 20, padding: 24, gap: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center" }}>
              <Feather name="star" size={20} color={C.primary} />
            </View>
            <View>
              <Text style={{ color: C.text, fontSize: 16, fontFamily: "Inter_700Bold" }}>Guardar tarjeta</Text>
              <Text style={{ color: C.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>Para futuros pagos</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.inputBg, borderRadius: 12, padding: 14 }}>
            <Feather name="credit-card" size={20} color={C.primary} />
            <Text style={{ color: C.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              {pendingCardSave.brand.toUpperCase()} •••• {pendingCardSave.lastFour}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: C.textSecondary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Alias (opcional)</Text>
            <TextInput
              value={saveAlias}
              onChangeText={setSaveAlias}
              placeholder="Ej: Mi Visa personal"
              placeholderTextColor={C.textMuted}
              maxLength={100}
              style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: C.text, backgroundColor: C.inputBg }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={handleSkipSave}
              disabled={savingCard}
              style={{ flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ color: C.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Omitir</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveCard}
              disabled={savingCard}
              style={{ flex: 1, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", opacity: savingCard ? 0.7 : 1 }}
            >
              {savingCard ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>{isPreload ? t("topUp.preloadTitle") : t("topUp.title")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {isPreload && (
          <Card style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Feather name="info" size={16} color={C.primary} style={{ marginTop: 2 }} />
            <Text style={{ color: C.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }}>
              {t("topUp.preloadHint")}
            </Text>
          </Card>
        )}

        {!isPreload && <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.selectBracelet").toUpperCase()}
          </Text>
          {bracelets.length > 0 ? (
            bracelets.map((b) => {
              const isRefunded = !!b.pendingRefund;
              const isSelected = braceletUid === b.uid && !isRefunded;
              return (
                <Pressable
                  key={b.uid}
                  onPress={() => { if (!isRefunded) setBraceletUid(b.uid); }}
                  disabled={isRefunded}
                  style={[
                    styles.braceletOption,
                    {
                      backgroundColor: isSelected ? C.primaryLight : isRefunded ? (C.inputBg + "80") : C.inputBg,
                      borderColor: isSelected ? C.primary : C.border,
                      opacity: isRefunded ? 0.55 : 1,
                    },
                  ]}
                >
                  <Feather name="wifi" size={16} color={isSelected ? C.primary : C.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.braceletOptionText, { color: isSelected ? C.primary : C.text }]}>
                      {b.event?.name ?? b.uid}
                    </Text>
                    {b.event && (
                      <Text style={[styles.braceletEventText, { color: C.textMuted }]}>
                        {b.uid}
                      </Text>
                    )}
                  </View>
                  {isRefunded && (
                    <View style={[styles.refundBadge, { backgroundColor: C.dangerLight ?? "#FEE2E2" }]}>
                      <Text style={[styles.refundBadgeText, { color: C.danger }]}>
                        {t("topUp.refundPending")}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          ) : (
            <Text style={[styles.hintText, { color: C.textMuted }]}>{t("topUp.noBracelet")}</Text>
          )}
          {nfcAvailable && (
            <Pressable
              onPress={handleNfcScan}
              disabled={scanning}
              style={[styles.nfcBtn, { borderColor: C.primary, backgroundColor: C.primaryLight }]}
            >
              <Feather name="wifi" size={16} color={C.primary} />
              <Text style={[styles.nfcBtnText, { color: C.primary }]}>
                {scanning ? t("home.scanning") : t("topUp.scanToSelect")}
              </Text>
            </Pressable>
          )}
          {!isSelectedFromList && (
            <>
              <View style={styles.manualRow}>
                <View style={[styles.manualInputWrap, { backgroundColor: C.inputBg, borderColor: braceletUid ? C.primary : C.border }]}>
                  <Feather name="hash" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.manualInput, { color: C.text }]}
                    placeholder={t("topUp.uidPlaceholder")}
                    placeholderTextColor={C.textMuted}
                    value={braceletUid}
                    onChangeText={(v) => setBraceletUid(normalizeUid(v))}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={11}
                  />
                  {braceletUid.length > 0 && (
                    <Pressable onPress={() => setBraceletUid("")}>
                      <Feather name="x" size={16} color={C.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
              <Text style={[styles.uidHint, { color: C.textMuted }]}>
                {t("topUp.uidHint")}
              </Text>
            </>
          )}
        </Card>}

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.amount").toUpperCase()}
          </Text>
          <View style={styles.amountGrid}>
            {AMOUNTS.map((amt) => (
              <Pressable
                key={amt}
                onPress={() => { setSelectedAmount(amt); setCustomAmount(""); }}
                style={[
                  styles.amountChip,
                  {
                    backgroundColor: selectedAmount === amt ? C.primary : C.inputBg,
                    borderColor: selectedAmount === amt ? C.primary : C.border,
                  },
                ]}
              >
                <Text style={[styles.amountChipText, { color: selectedAmount === amt ? "#0a0a0a" : C.text }]}>
                  {formatCOP(amt)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.orLabel, { color: C.textMuted }]}>{t("topUp.orCustom")}</Text>
          <TextInput
            style={inputStyle}
            placeholder={t("topUp.amountPlaceholder")}
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
          />
          {effectiveAmount > 0 && (
            <Text style={[styles.amountPreview, { color: C.primary }]}>
              {t("topUp.total")}: {formatCOP(effectiveAmount)}
            </Text>
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
            {t("topUp.method").toUpperCase()}
          </Text>
          <View style={styles.methodGrid}>
            {([
              { id: "nequi", icon: "smartphone", label: "Nequi" },
              { id: "daviplata", icon: "smartphone", label: "Daviplata" },
              { id: "pse", icon: "globe", label: "PSE" },
              { id: "card", icon: "credit-card", label: t("tickets.creditCard") },
              { id: "bancolombia_transfer", icon: "repeat", label: "Bancolombia" },
              { id: "puntoscolombia", icon: "star", label: "Puntos Col." },
            ] as { id: DigitalMethod; icon: string; label: string }[]).map((m) => (
              <Pressable
                key={m.id}
                onPress={() => { setMethod(m.id); setSelectedBank(null); setShowBankPicker(false); setPhoneNumber(""); }}
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: method === m.id ? C.primaryLight : C.inputBg,
                    borderColor: method === m.id ? C.primary : C.border,
                  },
                ]}
              >
                {m.id === "nequi" ? (
                  <SvgXml
                    xml={nequiXml(method === m.id ? C.primary : C.textSecondary)}
                    width={20}
                    height={20}
                  />
                ) : m.id === "bancolombia_transfer" ? (
                  <SvgXml
                    xml={bancolombiaXml(method === m.id ? C.primary : C.textSecondary)}
                    width={20}
                    height={20}
                  />
                ) : m.id === "daviplata" ? (
                  <SvgXml
                    xml={daviplataXml(method === m.id ? C.primary : C.textSecondary)}
                    width={24}
                    height={20}
                  />
                ) : m.id === "puntoscolombia" ? (
                  <SvgXml
                    xml={puntosColombiaXml(method === m.id ? C.primary : C.textSecondary)}
                    width={56}
                    height={22}
                  />
                ) : m.id === "pse" ? (
                  <SvgXml
                    xml={pseXml(method === m.id ? C.primary : C.textSecondary)}
                    width={20}
                    height={20}
                  />
                ) : (
                  <Feather
                    name={m.icon as never}
                    size={20}
                    color={method === m.id ? C.primary : C.textSecondary}
                  />
                )}
                <Text style={[styles.methodLabel, { color: method === m.id ? C.primary : C.text }]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {method === "nequi" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("topUp.nequiNumber").toUpperCase()}
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.nequiHint")}
            </Text>
            <PhoneInput
              number={phoneNumber}
              onNumberChange={setPhoneNumber}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              placeholder={t("topUp.nequiPlaceholder")}
            />
          </Card>
        )}

        {method === "daviplata" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              NÚMERO DAVIPLATA
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              Recibirás una notificación en tu app Daviplata para aprobar el pago.
            </Text>
            <PhoneInput
              number={phoneNumber}
              onNumberChange={setPhoneNumber}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              placeholder="Número celular Daviplata"
            />
          </Card>
        )}

        {method === "puntoscolombia" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              PUNTOS COLOMBIA
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              Recibirás una notificación en tu app Puntos Colombia para aprobar el pago.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="Número celular (10 dígitos)"
              placeholderTextColor={C.textMuted}
              value={phoneNumber}
              onChangeText={(v) => setPhoneNumber(v.replace(/\D/g, "").slice(0, 10))}
              keyboardType="phone-pad"
              maxLength={10}
            />
            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>
              DOCUMENTO DE IDENTIDAD
            </Text>
            <Pressable
              onPress={() => setShowLegalIdTypePicker(!showLegalIdTypePicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: C.text, flex: 1, fontFamily: "Inter_400Regular" }}>
                {LEGAL_ID_TYPES.find(t => t.code === legalIdType)?.label ?? "Cédula de Ciudadanía"}
              </Text>
              <Feather name={showLegalIdTypePicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showLegalIdTypePicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                {LEGAL_ID_TYPES.map((idType) => (
                  <Pressable
                    key={idType.code}
                    onPress={() => { setLegalIdType(idType.code); setShowLegalIdTypePicker(false); }}
                    style={[
                      styles.bankItem,
                      {
                        backgroundColor: legalIdType === idType.code ? C.primaryLight : "transparent",
                        borderBottomColor: C.separator,
                      },
                    ]}
                  >
                    <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{idType.label}</Text>
                    {legalIdType === idType.code && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="Número de documento"
              placeholderTextColor={C.textMuted}
              value={legalId}
              onChangeText={(v) => setLegalId(v.replace(/[^0-9a-zA-Z\-]/g, ""))}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </Card>
        )}

        {method === "pse" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              TIPO DE PERSONA
            </Text>
            <Pressable
              onPress={() => setShowPseUserTypePicker(!showPseUserTypePicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: C.text, flex: 1, fontFamily: "Inter_400Regular" }}>
                {pseUserType === 0 ? "Persona natural" : "Persona jurídica"}
              </Text>
              <Feather name={showPseUserTypePicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showPseUserTypePicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                {([{ label: "Persona natural", value: 0 }, { label: "Persona jurídica", value: 1 }] as const).map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => { setPseUserType(opt.value as 0 | 1); setShowPseUserTypePicker(false); }}
                    style={[styles.bankItem, { backgroundColor: pseUserType === opt.value ? C.primaryLight : "transparent", borderBottomColor: C.separator }]}
                  >
                    <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{opt.label}</Text>
                    {pseUserType === opt.value && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>
              {t("topUp.pseBank").toUpperCase()}
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.pseInfo")}
            </Text>
            {pseBanksError ? (
              <View style={[styles.bankErrorBox, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                <Feather name="alert-circle" size={14} color={C.danger} />
                <Text style={[styles.bankErrorText, { color: C.danger }]}>{t("topUp.pseBanksError")}</Text>
                <Pressable onPress={() => refetchPseBanks()}>
                  <Text style={[styles.bankRetryText, { color: C.danger }]}>{t("common.retry")}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => { if (!pseBanksLoading) setShowBankPicker(!showBankPicker); }}
                  style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
                >
                  {pseBanksLoading ? (
                    <Text style={{ color: C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                      {t("topUp.pseBanksLoading")}
                    </Text>
                  ) : (
                    <Text style={{ color: selectedBank ? C.text : C.textMuted, flex: 1, fontFamily: "Inter_400Regular" }}>
                      {selectedBank ? selectedBank.name : t("topUp.pseBankPlaceholder")}
                    </Text>
                  )}
                  <Feather
                    name={pseBanksLoading ? "loader" : showBankPicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={C.textSecondary}
                  />
                </Pressable>
                {showBankPicker && pseBanks.length > 0 && (
                  <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                      {pseBanks.map((bank) => (
                        <Pressable
                          key={bank.code}
                          onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                          style={[
                            styles.bankItem,
                            {
                              backgroundColor: selectedBank?.code === bank.code ? C.primaryLight : "transparent",
                              borderBottomColor: C.separator,
                            },
                          ]}
                        >
                          <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{bank.name}</Text>
                          {selectedBank?.code === bank.code && (
                            <Feather name="check" size={16} color={C.primary} />
                          )}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>
              DOCUMENTO DE IDENTIDAD
            </Text>
            <Pressable
              onPress={() => setShowLegalIdTypePicker(!showLegalIdTypePicker)}
              style={[styles.bankSelector, { backgroundColor: C.inputBg, borderColor: C.border }]}
            >
              <Text style={{ color: C.text, flex: 1, fontFamily: "Inter_400Regular" }}>
                {LEGAL_ID_TYPES.find(t => t.code === legalIdType)?.label ?? "Cédula de Ciudadanía"}
              </Text>
              <Feather name={showLegalIdTypePicker ? "chevron-up" : "chevron-down"} size={18} color={C.textSecondary} />
            </Pressable>
            {showLegalIdTypePicker && (
              <View style={[styles.bankList, { backgroundColor: C.card, borderColor: C.border }]}>
                {LEGAL_ID_TYPES.map((idType) => (
                  <Pressable
                    key={idType.code}
                    onPress={() => { setLegalIdType(idType.code); setShowLegalIdTypePicker(false); }}
                    style={[
                      styles.bankItem,
                      {
                        backgroundColor: legalIdType === idType.code ? C.primaryLight : "transparent",
                        borderBottomColor: C.separator,
                      },
                    ]}
                  >
                    <Text style={{ color: C.text, fontFamily: "Inter_400Regular" }}>{idType.label}</Text>
                    {legalIdType === idType.code && <Feather name="check" size={16} color={C.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="Número de documento"
              placeholderTextColor={C.textMuted}
              value={legalId}
              onChangeText={(v) => setLegalId(v.replace(/[^0-9a-zA-Z\-]/g, ""))}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />

            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>
              CORREO ELECTRÓNICO
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              PSE enviará el enlace de pago a este correo.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              placeholder="tucorreo@ejemplo.com"
              placeholderTextColor={C.textMuted}
              value={pseEmail}
              onChangeText={setPseEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Card>
        )}

        {method === "card" && savedCards.length > 0 && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              TARJETAS GUARDADAS
            </Text>
            {savedCards.map((card: SavedCard) => (
              <Pressable
                key={card.id}
                onPress={() => { setSelectedSavedCardId(card.id); setShowNewCardForm(false); }}
                style={[
                  styles.savedCardBtn,
                  {
                    backgroundColor: selectedSavedCardId === card.id && !showNewCardForm ? C.primaryLight : C.inputBg,
                    borderColor: selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.border,
                  },
                ]}
              >
                {["visa", "mastercard", "amex"].includes(card.brand)
                  ? <CardBrandLogo brand={card.brand as CardBrand} />
                  : <Feather name="credit-card" size={18} color={selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.textSecondary} />
                }
                <Text style={[styles.savedCardText, { color: selectedSavedCardId === card.id && !showNewCardForm ? C.primary : C.text }]}>
                  {card.alias || card.brand.toUpperCase()} •••• {card.lastFour}
                </Text>
                {selectedSavedCardId === card.id && !showNewCardForm && (
                  <Feather name="check" size={16} color={C.primary} />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowNewCardForm(true); setSelectedSavedCardId(null); }}
              style={[
                styles.savedCardBtn,
                {
                  backgroundColor: showNewCardForm ? C.primaryLight : "transparent",
                  borderColor: showNewCardForm ? C.primary : C.border,
                  borderStyle: showNewCardForm ? "solid" : "dashed",
                },
              ]}
            >
              <Feather name="plus" size={16} color={showNewCardForm ? C.primary : C.textSecondary} />
              <Text style={[styles.savedCardText, { color: showNewCardForm ? C.primary : C.textSecondary }]}>
                Usar nueva tarjeta
              </Text>
              {showNewCardForm && <Feather name="check" size={16} color={C.primary} />}
            </Pressable>
          </Card>
        )}

        {method === "card" && usingNewCard && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {t("tickets.cardDetails").toUpperCase()}
            </Text>
            <View style={{ position: "relative" }}>
              <TextInput
                style={[inputStyle, { paddingRight: 56, fontVariant: ["tabular-nums"] }]}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={C.textMuted}
                value={cardNumber}
                onChangeText={(raw) => {
                  const brand = detectCardBrand(raw);
                  setCardNumber(formatCardNumber(raw, brand));
                }}
                keyboardType="numeric"
                maxLength={detectCardBrand(cardNumber) === "amex" ? 17 : 19}
              />
              <View style={{ position: "absolute", right: 10, top: 0, bottom: 0, justifyContent: "center", pointerEvents: "none" }}>
                <CardBrandLogo brand={detectCardBrand(cardNumber)} />
              </View>
            </View>
            <View style={styles.cardRow}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="MM/AA"
                placeholderTextColor={C.textMuted}
                value={cardExpiry}
                onChangeText={(v) => setCardExpiry(handleExpiryChange(v, cardExpiry))}
                keyboardType="numeric"
                maxLength={5}
              />
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="CVC"
                placeholderTextColor={C.textMuted}
                value={cardCvc}
                onChangeText={(v) => setCardCvc(v.replace(/\D/g, "").slice(0, detectCardBrand(cardNumber) === "amex" ? 4 : 3))}
                keyboardType="numeric"
                maxLength={detectCardBrand(cardNumber) === "amex" ? 4 : 3}
                secureTextEntry
              />
            </View>
            <TextInput
              style={inputStyle}
              placeholder={t("tickets.cardHolder")}
              placeholderTextColor={C.textMuted}
              value={cardHolder}
              onChangeText={setCardHolder}
              autoCapitalize="characters"
            />
          </Card>
        )}

        {method === "bancolombia_transfer" && (
          <Card style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>
              {"BANCOLOMBIA TRANSFER"}
            </Text>
            <Text style={[styles.hintText, { color: C.textSecondary }]}>
              {t("topUp.bancolombiaTransferInfo")}
            </Text>
          </Card>
        )}

        <View style={[styles.infoBox, { backgroundColor: C.cardSecondary, borderColor: C.border }]}>
          <Feather name="info" size={14} color={C.textSecondary} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            {method === "nequi"
              ? t("topUp.nequiInfo")
              : method === "pse"
              ? t("topUp.pseInfo")
              : method === "bancolombia_transfer"
              ? t("topUp.bancolombiaTransferInfo")
              : t("topUp.cardInfo")}
          </Text>
        </View>

        <Button
          title={(isPending || isTokenizing) ? t("topUp.submitting") : `${t("topUp.submit")}${effectiveAmount > 0 ? ` ${formatCOP(effectiveAmount)}` : ""}`}
          onPress={handleSubmit}
          disabled={!canSubmit || isPending || isTokenizing}
          loading={isPending || isTokenizing}
          variant="primary"
          fullWidth
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { padding: 20, gap: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  braceletOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  braceletOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  braceletEventText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  refundBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  refundBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  nfcBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  nfcBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  manualRow: { marginTop: 4 },
  manualInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manualInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  uidHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  amountGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amountChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: "30%",
    alignItems: "center",
  },
  amountChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  orLabel: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  amountPreview: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
    width: "48%",
  },
  methodLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  savedCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  savedCardText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardRow: { flexDirection: "row", gap: 10 },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bankSelector: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  bankList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  bankItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bankErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  bankErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  bankRetryText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
});
