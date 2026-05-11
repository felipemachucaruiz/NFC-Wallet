import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { Check, AlertCircle, Ticket, CreditCard, Star, Shield } from "lucide-react";

function PseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38" className={className} fill="currentColor">
      <path d="M12.17,15.02h0s.54.01.54.01l.07-.4h-.73l-.05.2s0,.09.03.12.07.06.12.06Z"/>
      <path d="M28.26,16.97h.01s-2.23.01-2.23.01c-.42,0-.77.29-.85.7l-.27,1.46h3.97l.23-1.14c.05-.25-.01-.51-.18-.71-.17-.2-.41-.32-.67-.32Z"/>
      <path d="M15.11,16.98h-1.93c-.5,0-.92.35-1.01.84l-.15.79-.46,2.53c-.06.29.02.6.22.84.19.24.48.36.78.36h1.94c.5,0,.92-.35,1.01-.84l.6-3.32c.06-.29-.02-.6-.22-.84-.19-.24-.48-.36-.78-.36Z"/>
      <path d="M18.99,3.85c-6.1,0-11.39,3.46-14.03,8.51.37.02.68.33.68.71s-.32.73-.73.73c-.22,0-.4-.1-.53-.25-.15.33-.26.68-.38,1.03l-.03.09c.18.14.29.33.29.57,0,.37-.29.68-.66.7-.1.41-.18.83-.25,1.25h2.02l1.67,2.04h3.28v.57h-1.69l-1.29,2.32h-1.76c-.11.26-.36.44-.66.44-.4,0-.73-.32-.73-.73s.32-.73.73-.73c.29,0,.56.18.66.44h1.43l.97-1.76H3.17c0,1.2.16,2.37.43,3.5.26.1.45.36.45.67,0,.17-.07.32-.16.44.14.45.31.9.49,1.33.14-.17.33-.28.56-.28.4,0,.73.32.73.73s-.32.73-.73.73h-.01c2.63,5.11,7.93,8.61,14.08,8.61,8.74,0,15.83-7.08,15.83-15.83S27.74,3.85,18.99,3.85ZM6.27,15.97c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM6.36,24.7c-.4,0-.73-.32-.73-.73s.32-.73.73-.73.73.32.73.73-.32.73-.73.73ZM14.64,13.31c.01-.06.07-.1.14-.09.06.01.1.07.09.14l-.09.49s.06-.03.09-.03h.36c.11,0,.23.05.29.14s.1.2.08.32l-.17.91s-.06.09-.11.09h-.02c-.06-.01-.1-.07-.09-.14l.17-.91s0-.09-.03-.12-.07-.06-.12-.06h-.36c-.08,0-.14.06-.15.12l-.19,1.01c-.01.06-.07.1-.14.09-.06-.01-.1-.07-.09-.14l.16-.8.19-1.01ZM13.22,14.11h.01c.03-.17.19-.31.37-.31h.62c.07,0,.11.05.11.11s-.05.11-.11.11h-.62c-.08,0-.14.06-.15.12l-.14.68s0,.09.03.12.07.06.11.06h.6c.07,0,.11.05.11.11s-.05.11-.11.11h-.6c-.11,0-.23-.05-.29-.14-.07-.09-.1-.2-.08-.32l.12-.68ZM11.84,14.58c.02-.09.1-.16.19-.16h.79l.03-.19s0-.09-.03-.12-.07-.06-.11-.06h-.6c-.07,0-.11-.05-.11-.11s.05-.11.11-.11h.6c.11,0,.23.05.29.14.07.09.1.2.08.32l-.05.23-.14.75h-.74c-.11.01-.23-.03-.29-.12s-.1-.2-.08-.32l.05-.23ZM14.53,23.5h-.01s-1.94-.01-1.94-.01c-.5,0-.96-.17-1.34-.48l-.57,3.09c-.05.27-.28.46-.56.46h-.1c-.31-.06-.51-.35-.45-.66l.91-4.95.6-3.32c.18-1.02,1.08-1.77,2.12-1.77h1.94c.65,0,1.25.28,1.65.77.41.49.58,1.13.46,1.77l-.6,3.32c-.18,1.02-1.08,1.77-2.12,1.77ZM19.15,19.01h2.31c.6,0,1.73.45,1.73,2.15,0,1.37-1.48,2.37-2.12,2.37h-3.85c-.32,0-.57-.25-.57-.57s.25-.57.57-.57h3.85c.17-.05.99-.61.99-1.24,0-.96-.5-1.02-.6-1.02h-2.31c-.68,0-1.69-.54-1.69-2.06,0-1.43,1.36-2.22,2.3-2.22h3.07c.32,0,.57.25.57.57s-.25.57-.57.57h-3.07c-.33,0-1.17.33-1.17,1.09,0,.92.56.93.56.93ZM29.98,19.46h0c-.09.5-.52.84-1.01.84h-4.27l-.22,1.07c-.05.25.01.51.18.71s.41.32.67.32h3.21c.32,0,.57.25.57.57s-.25.57-.57.57h-3.21c-.6,0-1.16-.26-1.54-.73-.39-.46-.53-1.07-.42-1.65l.24-1.22.02-.05.43-2.38c.17-.95,1-1.64,1.96-1.64h2.23c.6,0,1.16.26,1.54.73.39.46.53,1.07.42,1.65l-.24,1.22Z"/>
      <path d="M5.12,17.77h-1.82c-.06.49-.09.97-.1,1.47h3.13l-1.2-1.47Z"/>
    </svg>
  );
}

function NequiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.15 30">
      <path fill="#ca0080" d="M8.38,3.86h-3.93c-.46,0-.83.37-.83.83v3.34c0,.46.37.83.83.83h3.93c.46,0,.83-.37.83-.83v-3.34c0-.46-.37-.83-.83-.83Z"/>
      <path fill="currentColor" d="M32.4,3.86h-3.39c-.46,0-.83.38-.83.83v13.55c0,.28-.36.38-.49.13l-7.88-14.15c-.13-.23-.36-.36-.64-.36h-5.64c-.46,0-.83.38-.83.83v21.65c0,.46.38.83.83.83h3.39c.46,0,.83-.38.83-.83v-13.96c0-.28.36-.38.49-.13l8.1,14.57c.13.23.36.36.64.36h5.39c.46,0,.83-.38.83-.83V4.68c0-.46-.38-.83-.83-.83h.03Z"/>
    </svg>
  );
}

function BancolombiaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110.54 110.83" fill="currentColor">
      <path d="M82.66.03c-21.47,2.65-42.21,6.56-63,12.59-2.71.85-4.37,3.88-3.69,6.57,1.52,5.99,2.29,8.99,3.83,15,.65,2.54,3.21,3.84,5.8,2.98,21.24-6.54,42.53-11.01,64.51-14.27,2.52-.34,3.89-2.94,2.97-5.55-1.95-5.51-2.93-8.25-4.92-13.73-.86-2.32-3.15-3.85-5.5-3.59ZM100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34-2.26,1.07-3.62,3.92-3.14,6.43,1.22,6.42,1.83,9.64,3.07,16.07.53,2.75,3.1,4.02,5.63,2.78,31.53-14.45,64.84-23.64,99.01-29.12,2.17-.36,3.28-2.85,2.45-5.41-1.72-5.32-2.59-7.98-4.37-13.27-.81-2.46-3.04-4.11-5.26-3.82ZM100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03-2.58.95-4.03,3.66-3.35,6.17,1.62,5.96,2.42,8.95,4.06,14.93.77,2.81,3.93,4.25,6.83,3.14,20.31-7.28,40.83-13.63,61.79-18.73,2.01-.49,3-2.85,2.26-5.28-1.65-5.37-2.48-8.05-4.18-13.39-.83-2.63-3.27-4.35-5.58-3.87Z"/>
    </svg>
  );
}

function DaviplataIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 41" fill="none">
      <path d="M12.3535 17.4629C12.3776 17.3699 12.3937 17.2787 12.4104 17.1876C12.4271 17.1048 12.4431 17.0226 12.4561 16.9366C12.5 16.6073 12.5081 16.2934 12.4846 15.9988C12.4827 15.9815 12.4802 15.9642 12.4784 15.9468C12.471 15.8653 12.4574 15.7864 12.445 15.7068C12.3553 15.1939 12.2008 14.7285 11.9874 14.31C11.9825 14.3004 11.9769 14.2927 11.9726 14.2831C11.9163 14.1752 11.8557 14.0725 11.792 13.9711C11.7494 13.9031 11.7073 13.8383 11.6634 13.776C11.6344 13.7336 11.6034 13.6913 11.5731 13.6502C11.5107 13.5648 11.4495 13.4859 11.3889 13.4127C11.3209 13.3325 11.2522 13.2522 11.1805 13.1765C11.165 13.1604 11.1508 13.1437 11.1354 13.129C8.38623 10.3092 2.39762 10.5974 0.68606 11.3465C-0.471469 11.8516 -0.0720232 13.3414 1.19557 12.7599C3.25773 12.2182 5.24692 12.2291 7.28249 12.7599C8.94397 13.1925 10.6858 14.7022 10.6858 16.3236C10.5671 20.361 5.42191 20.5215 3.33626 19.9958V14.9731C3.33626 13.7741 1.84915 13.7644 1.84915 14.9635V20.0138C1.84915 21.0273 2.3531 21.3951 3.01905 21.5536C4.58963 21.9266 11.1811 22.3252 12.3522 17.4629H12.3535Z" fill="currentColor"/>
      <path d="M40.1317 20.7905V11.9357C40.1311 10.5358 38.4368 10.5435 38.4368 11.9126V20.7404C38.4368 22.0639 40.1317 22.114 40.1317 20.7905Z" fill="currentColor"/>
      <path d="M35.8887 11.4254C35.1491 13.6104 32.6127 19.7115 31.0768 19.7275C29.539 19.7429 26.9166 13.6951 26.1362 11.5243C25.6675 10.2232 24.2367 11.1687 24.7042 12.4698C25.5433 14.8043 28.6955 21.8444 31.1108 21.7565C33.5241 21.795 36.5423 14.6913 37.3387 12.3408C37.7814 11.0307 36.3351 10.1147 35.8881 11.4254H35.8887Z" fill="currentColor"/>
      <path d="M19.4786 10.8452C16.8649 10.7682 13.4912 17.8192 12.5971 20.1576C12.095 21.4619 13.6483 22.3996 14.1504 21.096C14.9808 18.9239 17.8177 12.8658 19.4817 12.8748C21.1432 12.8851 23.8855 18.9765 24.6955 21.157C25.1815 22.4664 26.7447 21.5466 26.2574 20.2365C25.3881 17.8885 22.0886 10.7983 19.4786 10.8445V10.8452Z" fill="currentColor"/>
      <path d="M47.1857 11.4839C45.9682 10.419 43.9963 8.88103 43.1331 8.21412C43.2259 7.25259 43.3934 6.23457 43.6012 5.37959C43.8621 4.31792 44.0847 3.11119 43.4182 2.22026C42.9717 1.62395 42.2662 1.33382 41.2614 1.33382H37.795C36.8292 1.33382 36.1113 1.64513 35.6624 2.25813C35.4806 2.50654 35.3557 2.79217 35.2895 3.10605C31.6951 1.13484 28.6554 0.00962818 26.8659 0C23.8366 0.016047 16.6355 3.64138 10.4719 8.25392C10.2344 8.43172 10.1813 8.77512 10.3519 9.02096C10.5226 9.2668 10.854 9.32265 11.0908 9.14549C17.7101 4.19147 24.4358 1.11173 26.8659 1.0989C28.5774 1.10852 31.8175 2.37559 35.5325 4.4893L36.4569 5.01564L36.311 3.93151C36.256 3.52006 36.3227 3.17152 36.5052 2.92247C36.7432 2.59704 37.1767 2.43208 37.7944 2.43208H41.2608C41.9169 2.43208 42.3491 2.58292 42.5816 2.89359C42.955 3.39233 42.7831 4.26015 42.5741 5.10871C42.3311 6.11197 42.1401 7.32063 42.0504 8.42466L42.0257 8.73019L42.2631 8.91249C42.9229 9.41957 45.1773 11.1642 46.5031 12.3241C48.4892 14.0616 49.2844 15.6509 48.8033 16.9193C48.2839 18.2878 46.1976 19.1145 43.6074 18.9771C43.2729 18.9605 42.9421 18.9438 42.6168 18.9264L42.0183 18.895L42.0622 19.5157C42.1735 21.0992 42.7207 23.5634 44.6926 26.3106L44.7105 26.3344C46.8085 28.9423 47.1257 32.0901 45.5595 34.7532C43.6989 37.9164 39.0601 40.4769 32.8897 39.0667L32.75 39.0346L32.6139 39.0801C30.822 39.6777 28.1403 39.9005 26.8708 39.9005C25.6014 39.9005 22.919 39.6777 21.1289 39.0801L20.9929 39.0346L20.8532 39.0667C14.6815 40.4769 10.0415 37.9158 8.18094 34.7526C6.61469 32.0894 6.93189 28.9423 9.02991 26.3344C9.21727 26.1014 9.18759 25.7547 8.96313 25.5603C8.73868 25.3658 8.40478 25.3966 8.21742 25.6296C5.81518 28.6162 5.46334 32.2409 7.27754 35.3252C9.34484 38.8851 13.9486 40.9397 19.9021 40.9397C20.8981 40.9397 21.9257 40.8706 22.9641 40.7165C24.1718 40.9455 25.5536 41 26.8714 41C28.1893 41 29.5711 40.9455 30.7788 40.7165C31.8172 40.8706 32.8448 40.9397 33.8408 40.9397C39.7943 40.9397 44.3987 38.8851 46.4635 35.3258C48.2752 32.2454 47.9271 28.6259 45.5335 26.3306L45.5156 26.3068C43.5437 23.5596 42.9952 21.0954 42.8852 19.5119C43.1547 19.526 43.4274 19.5414 43.7051 19.5567C46.7177 19.7184 49.3011 18.6944 50 16.8615C50.6335 15.1791 49.5848 13.1431 47.1863 11.4839H47.1857Z" fill="currentColor"/>
      <path d="M14.3365 35.1794V32.3083C14.739 32.4027 15.1416 32.4431 15.5441 32.4431C17.4789 32.4431 19.0241 31.2974 19.0241 28.588C19.0241 26.1752 17.8425 25.0833 16.3752 25.0833C15.4792 25.0833 14.7131 25.5551 14.2066 26.2695C14.1287 25.8786 14.0119 25.5551 13.8171 25.2316H13.012C13.0899 26.1213 13.1029 26.8357 13.1029 27.5231V35.1794H14.3365ZM14.3365 26.8215C14.8559 26.498 15.4792 26.2554 16.0635 26.2554C17.1413 26.2554 17.8165 26.8485 17.8165 28.6817C17.8165 30.8249 16.7387 31.3641 15.5571 31.3641C15.1935 31.3641 14.765 31.3237 14.3365 31.2024V26.8215Z" fill="currentColor"/>
      <path d="M20.2892 22.1981V30.5284C20.2892 31.9707 20.9515 32.456 21.9124 32.456C22.224 32.456 22.5746 32.4155 22.9642 32.3077V31.2158C22.6525 31.2698 22.3928 31.3237 22.198 31.3237C21.7046 31.3237 21.5228 31.0676 21.5228 30.3397V22.1981H20.2892Z" fill="currentColor"/>
      <path d="M23.6103 30.7447C23.6103 31.9039 24.4024 32.4431 25.3503 32.4431C26.3891 32.4431 27.2202 31.877 27.5838 30.8391C27.6617 31.4591 27.8045 31.85 27.9863 32.2948H28.7914C28.6745 31.3378 28.6615 30.7043 28.6615 30.0438V27.9814C28.6615 25.9191 27.5318 25.0833 25.9217 25.0833C25.3114 25.0833 24.6362 25.2046 23.922 25.4338V26.5526C24.5582 26.4043 25.2075 26.256 25.7918 26.256C26.7008 26.256 27.4929 26.5526 27.5059 27.8197C26.3891 28.7632 23.6103 28.4128 23.6103 30.7447ZM27.5059 28.8171V29.3294C27.5059 30.583 26.48 31.4052 25.61 31.4052C25.1036 31.4052 24.779 31.1491 24.779 30.6234C24.779 29.3294 26.3891 29.6259 27.5059 28.8171Z" fill="currentColor"/>
      <path d="M32.7908 32.4431C33.3102 32.4431 33.8815 32.3353 34.5308 32.1331V31.0278C33.9595 31.1895 33.4401 31.2704 33.0115 31.2704C32.2065 31.2704 31.726 30.9065 31.726 29.7203V26.2426H34.388V25.2316H31.726V23.2097H30.5574V25.2855C30.0769 25.3529 29.6354 25.4608 29.2848 25.5956V26.2426H30.4924V29.7068C30.4924 31.6074 31.3235 32.4431 32.7908 32.4431Z" fill="currentColor"/>
      <path d="M35.5238 25.4332V26.552C36.1601 26.4037 36.8094 26.2554 37.3937 26.2554C38.3027 26.2554 39.0948 26.552 39.1077 27.819C37.991 28.7626 35.2122 28.4121 35.2122 30.7441C35.2122 31.9033 36.0043 32.4425 36.9522 32.4425C37.991 32.4425 38.8221 31.8763 39.1857 30.8384C39.2636 31.4585 39.4064 31.8494 39.5882 32.2942H40.3933C40.2764 31.3372 40.2634 30.7036 40.2634 30.0431V27.9808C40.2634 25.9184 39.1337 25.0827 37.5236 25.0827C36.9133 25.0827 36.238 25.204 35.5238 25.4332ZM39.1084 29.3294C39.1084 30.5829 38.0825 31.4052 37.2125 31.4052C36.7061 31.4052 36.3815 31.1491 36.3815 30.6234C36.3815 29.3294 37.9916 29.6259 39.1084 28.8171V29.3294Z" fill="currentColor"/>
    </svg>
  );
}

function PuntosColombiaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54.25 19.66">
      <path fill="#5e00cc" d="M8.82.17C4.25.08.51,3.72.43,8.25h0v10.75c0,.27.22.48.48.48h4.02c.27,0,.48-.22.48-.48v-2.71c0-.15.15-.26.3-.2.91.35,1.9.54,2.94.54,4.58,0,8.29-3.75,8.23-8.35C16.82,3.86,13.23.25,8.82.17Z"/>
      <path fill="#fff" d="M5.87,11.51c-.72-.77-1.08-1.81-1.08-3.12s.37-2.34,1.11-3.12c.74-.77,1.74-1.16,3.01-1.16.99,0,1.81.28,2.47.84.65.57,1.03,1.31,1.14,2.23h-1.82c-.22-.96-.9-1.55-1.88-1.55-.67,0-1.2.25-1.6.76-.39.51-.59,1.17-.59,1.99s.19,1.48.58,1.99c.39.51.92.76,1.58.76,1,0,1.69-.59,1.91-1.55h1.81c-.1.92-.49,1.66-1.16,2.22-.67.57-1.53.85-2.55.85-1.24,0-2.22-.39-2.93-1.16Z"/>
      <path fill="currentColor" d="M19.96,15.59c-.32-.35-.49-.82-.49-1.41s.17-1.05.5-1.41c.33-.35.78-.53,1.34-.53.43,0,.8.12,1.09.36s.47.56.53.97h-.65c-.13-.49-.49-.78-1-.78-.36,0-.64.13-.85.38-.21.26-.32.59-.32,1.01s.1.75.31,1c.21.26.49.39.84.39.52,0,.89-.29,1.01-.78h.65c-.06.4-.24.72-.54.97-.3.24-.67.36-1.12.36-.55,0-.99-.18-1.32-.53h0Z"/>
      <path fill="currentColor" d="M24.65,16.12c-.43,0-.77-.13-1.03-.39-.26-.26-.39-.6-.39-1.03s.13-.77.39-1.04c.26-.26.6-.39,1.03-.39s.77.13,1.03.4c.26.26.39.61.39,1.03s-.13.77-.39,1.03c-.26.26-.61.39-1.03.39h0ZM24.65,15.62c.24,0,.44-.09.6-.26.15-.17.23-.39.23-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.6-.26s-.44.08-.59.26c-.15.17-.23.39-.23.67s.07.49.23.67c.15.17.35.26.59.26h0Z"/>
      <path fill="currentColor" d="M26.49,16.09v-3.82h.59v3.82h-.59Z"/>
      <path fill="currentColor" d="M28.92,16.12c-.43,0-.77-.13-1.03-.39-.26-.26-.39-.6-.39-1.03s.13-.77.39-1.04c.26-.26.6-.39,1.03-.39s.77.13,1.03.4c.26.26.39.61.39,1.03s-.13.77-.39,1.03c-.26.26-.61.39-1.03.39h0ZM28.92,15.62c.24,0,.44-.09.6-.26.15-.17.23-.39.23-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.6-.26s-.44.08-.59.26c-.15.17-.23.39-.23.67s.07.49.23.67c.15.17.35.26.59.26h0Z"/>
      <path fill="currentColor" d="M35.02,14.48v1.61h-.59v-1.57c0-.49-.2-.75-.58-.75-.2,0-.36.07-.48.22-.12.14-.18.34-.18.59v1.51h-.59v-1.57c0-.49-.2-.75-.59-.75-.2,0-.36.07-.48.22s-.18.35-.18.6v1.49h-.59v-2.79h.51l.07.37c.2-.26.47-.4.82-.4.38,0,.7.17.86.51.19-.32.51-.51.96-.51.58,0,1.05.33,1.05,1.22h0Z"/>
      <path fill="currentColor" d="M37.95,13.65c.24.26.36.6.36,1.05s-.12.77-.37,1.03c-.25.26-.56.39-.95.39s-.71-.15-.91-.44l-.07.4h-.51v-3.82h.59v1.44c.22-.3.52-.45.9-.45s.71.13.95.38h0ZM37.49,15.37c.15-.17.22-.4.22-.67s-.07-.49-.23-.67c-.15-.17-.35-.26-.59-.26s-.44.08-.59.26c-.15.17-.22.39-.22.67s.07.5.22.68c.15.17.35.26.59.26s.44-.08.59-.26h0Z"/>
      <path fill="currentColor" d="M39.03,12.91c-.1,0-.19-.03-.26-.1-.07-.07-.1-.15-.1-.25s.03-.19.1-.26c.07-.07.15-.1.26-.1s.19.03.26.1c.07.07.1.15.1.26s-.03.19-.1.25c-.07.07-.15.1-.26.1ZM38.73,16.09v-2.79h.59v2.79h-.59Z"/>
      <path fill="currentColor" d="M42.51,15.57v.51h-.31c-.36,0-.51-.16-.51-.45-.21.32-.52.48-.92.48-.31,0-.56-.07-.75-.22-.19-.14-.28-.34-.28-.6,0-.57.42-.89,1.19-.89h.7v-.17c0-.31-.23-.5-.61-.5-.34,0-.59.16-.63.41h-.58c.03-.27.15-.49.38-.65.22-.16.51-.24.86-.24.75,0,1.17.36,1.17,1.01v1.12c0,.14.05.18.18.18h.12ZM41.63,14.85h-.73c-.38,0-.57.14-.57.42,0,.24.2.4.52.4.24,0,.43-.07.57-.2.14-.13.21-.3.21-.52v-.1h0Z"/>
      <path fill="currentColor" d="M29.92,8.01c0,.96-.34,1.43-1.12,1.43s-1.12-.47-1.12-1.43v-3.08h-1.58v3.08c0,2.04,1.1,2.73,2.7,2.73s2.7-.69,2.7-2.73v-3.08h-1.58v3.08h0Z"/>
      <path fill="currentColor" d="M22.44,2.84h-2.97v7.84h1.68v-2.41h1.29c1.77,0,2.94-1.06,2.94-2.71s-1.17-2.72-2.94-2.72h0ZM22.28,6.87h-1.13v-2.63h1.13c.85,0,1.4.5,1.4,1.32s-.55,1.31-1.4,1.31Z"/>
      <path fill="currentColor" d="M35.56,4.86c-.89,0-1.41.34-1.78.79l-.15-.72h-1.38v5.76h1.58v-2.95c0-1,.47-1.58,1.29-1.58s1.17.52,1.17,1.49v3.04h1.58v-3.19c0-1.97-1.06-2.63-2.31-2.63h0Z"/>
      <path fill="currentColor" d="M40.69,8.78v-2.52h1.32v-1.33h-1.32v-1.61h-1.58v1.61h-.95v1.33h.95v2.78c0,1.1.55,1.65,1.65,1.65h1.29v-1.33h-.78c-.41,0-.57-.17-.57-.57Z"/>
      <path fill="currentColor" d="M51.65,7.14c-.83-.1-1.32-.15-1.32-.58,0-.37.4-.59,1.02-.59s1.08.28,1.12.74h1.51c-.08-1.18-1.14-1.86-2.69-1.86-1.48-.01-2.48.74-2.48,1.88s1.04,1.49,2.39,1.65c.93.12,1.32.16,1.32.63,0,.4-.4.62-1.06.62-.77,0-1.21-.35-1.27-.85h-1.5c.07,1.23,1.15,1.98,2.76,1.98s2.62-.73,2.62-1.87c0-1.3-1.1-1.6-2.42-1.74h0Z"/>
      <path fill="currentColor" d="M45.34,10.79c-.92,0-1.66-.27-2.21-.81-.55-.54-.84-1.25-.84-2.14s.28-1.6.84-2.15c.55-.54,1.29-.81,2.21-.81s1.66.27,2.22.81c.55.54.83,1.26.83,2.15s-.27,1.61-.83,2.15c-.55.54-1.3.81-2.22.81ZM45.34,9.5c.44,0,.79-.15,1.05-.46.26-.31.39-.71.39-1.2s-.13-.9-.39-1.2c-.26-.31-.62-.46-1.05-.46s-.79.15-1.04.46c-.26.31-.38.71-.38,1.2s.13.9.38,1.2c.26.31.6.46,1.04.46Z"/>
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import { purchaseTickets, getAuthToken, getWompiConfig, fetchSavedCards, saveCard, getPseBanks, type SavedCard, type PseBank } from "@/lib/api";
import { Turnstile } from "@/components/Turnstile";

interface CheckoutData {
  eventId: string;
  eventName: string;
  ticketTypeId: string;
  ticketTypeName: string;
  sectionName: string;
  validDays: string;
  price: number;
  quantity: number;
  attendees: { name: string; email: string; phone: string; dateOfBirth?: string; sex?: "male" | "female" | ""; idDocument?: string }[];
  subtotal: number;
  serviceFee: number;
  total: number;
  currencyCode: string;
  unitSelections?: { ticketTypeId: string; unitId: string }[];
  selectedUnitLabel?: string;
}


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
  return (digits.match(/.{1,4}/g) || []).join(" ").slice(0, 19);
}

const CARD_LOGOS: Record<NonNullable<CardBrand>, string> = {
  visa: `${import.meta.env.BASE_URL}card-visa.png`,
  mastercard: `${import.meta.env.BASE_URL}card-mastercard.png`,
  amex: `${import.meta.env.BASE_URL}card-amex.png`,
};

function CardBrandLogo({ brand, className }: { brand: CardBrand; className?: string }) {
  if (!brand) return null;
  return (
    <img
      src={CARD_LOGOS[brand]}
      alt={brand}
      className={className ?? "h-7 w-auto object-contain shrink-0 drop-shadow-sm"}
    />
  );
}

function brandLabel(brand: string): string {
  switch (brand.toLowerCase()) {
    case "visa": return "Visa";
    case "mastercard": return "Mastercard";
    case "amex": return "American Express";
    default: return brand;
  }
}

interface PendingCardSave {
  wompiToken: string;
  brand: string;
  lastFour: string;
  cardHolderName: string;
  expiryMonth: string;
  expiryYear: string;
}

import { SEO } from "@/components/SEO";

export default function Checkout() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"nequi" | "pse" | "card" | "bancolombia_transfer" | "daviplata" | "puntoscolombia">("nequi");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const freeSubmittedRef = useRef(false);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const [nequiPhone, setNequiPhone] = useState("");
  const [pseBank, setPseBank] = useState("");
  const [pseLegalId, setPseLegalId] = useState("");
  const [pseLegalIdType, setPseLegalIdType] = useState<"CC" | "CE" | "NIT" | "PP" | "TI">("CC");
  const [daviplataPhone, setDaviplataPhone] = useState("");
  const [puntosPhone, setPuntosPhone] = useState("");
  const [puntosLegalId, setPuntosLegalId] = useState("");
  const [puntosLegalIdType, setPuntosLegalIdType] = useState<"CC" | "CE" | "NIT" | "PP" | "TI">("CC");
  const [pseBanks, setPseBanks] = useState<PseBank[]>([]);
  const [pseBanksLoading, setPseBanksLoading] = useState(false);
  const [pseUserType, setPseUserType] = useState<"0" | "1">("0");
  const [psePhone, setPsePhone] = useState("");
  const [pseEmail, setPseEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const isGuest = !getAuthToken();

  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);
  const [showNewCardForm, setShowNewCardForm] = useState(false);

  const [pendingCardSave, setPendingCardSave] = useState<PendingCardSave | null>(null);
  const [saveAlias, setSaveAlias] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const pendingNavRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("tapee_checkout");
    if (!raw) {
      navigate("/");
      return;
    }
    try {
      setData(JSON.parse(raw));
    } catch {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (isGuest) return;
    fetchSavedCards().then((res) => {
      setSavedCards(res.cards);
    }).catch(() => {});
  }, [isGuest]);

  useEffect(() => {
    if (paymentMethod === "card" && savedCards.length > 0 && selectedSavedCardId === null && !showNewCardForm) {
      setSelectedSavedCardId(savedCards[0].id);
    }
    if (paymentMethod !== "card") {
      setSelectedSavedCardId(null);
      setShowNewCardForm(false);
    }
  }, [paymentMethod]);

  useEffect(() => {
    const el = cardInputRef.current;
    if (!el) return;
    const handle = () => {
      const raw = el.value;
      const brand = detectCardBrand(raw);
      const formatted = formatCardNumber(raw, brand);
      if (formatted !== raw) setCardNumber(formatted);
    };
    el.addEventListener("change", handle);
    return () => el.removeEventListener("change", handle);
  }, []);

  const isFreeOrder = data !== null && data.total === 0;

  const submitFreeOrder = async () => {
    if (!data) return;
    setProcessing(true);
    setError("");
    try {
      const result = await purchaseTickets({
        eventId: data.eventId,
        attendees: data.attendees.map((a) => ({
          name: a.name,
          email: a.email,
          phone: a.phone || undefined,
          dateOfBirth: a.dateOfBirth || undefined,
          sex: (a.sex as "male" | "female") || undefined,
          idDocument: a.idDocument || undefined,
          ticketTypeId: data.ticketTypeId,
          shirtSize: (a as any).shirtSize || undefined,
        })),
        unitSelections: data.unitSelections,
        paymentMethod: "free",
        turnstileToken: isGuest ? turnstileToken : undefined,
      });

      sessionStorage.removeItem("tapee_checkout");
      sessionStorage.setItem("tapee_order_id", result.orderId);
      sessionStorage.setItem("tapee_order_status", result.status);
      navigate("/payment-status");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.errorProcessing"));
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!data || !isFreeOrder || freeSubmittedRef.current) return;
    if (isGuest && !turnstileToken) return;
    freeSubmittedRef.current = true;
    submitFreeOrder();
  }, [data, isFreeOrder, turnstileToken]);

  useEffect(() => {
    if (paymentMethod !== "pse" || pseBanks.length > 0 || pseBanksLoading) return;
    setPseBanksLoading(true);
    getPseBanks()
      .then((banks) => setPseBanks(banks))
      .catch(() => {})
      .finally(() => setPseBanksLoading(false));
  }, [paymentMethod]);

  if (!data) return null;

  if (isFreeOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          {error ? (
            <>
              <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Button onClick={submitFreeOrder}>
                {t("checkout.retry")}
              </Button>
            </>
          ) : (
            <>
              {isGuest && !turnstileToken ? (
                <div className="space-y-4">
                  <p className="text-lg font-medium">{t("checkout.verifyHuman")}</p>
                  <Turnstile onToken={setTurnstileToken} />
                </div>
              ) : (
                <>
                  <Ticket className="w-12 h-12 text-primary mx-auto animate-pulse" />
                  <p className="text-lg font-medium">{t("checkout.processingFreeOrder")}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const usingNewCard = paymentMethod === "card" && (savedCards.length === 0 || showNewCardForm || selectedSavedCardId === null);

  const isPaymentValid = () => {
    if (paymentMethod === "nequi") return /^\d{10}$/.test(nequiPhone.replace(/\s/g, ""));
    if (paymentMethod === "daviplata") return /^\d{10}$/.test(daviplataPhone.replace(/\s/g, ""));
    if (paymentMethod === "puntoscolombia") return /^\d{10}$/.test(puntosPhone.replace(/\s/g, "")) && puntosLegalId.trim().length >= 5;
    if (paymentMethod === "pse") return pseBank.length > 0 && pseLegalId.length > 0 && /^\d{7,15}$/.test(psePhone.replace(/\s/g, "")) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pseEmail.trim());
    if (paymentMethod === "card") {
      if (selectedSavedCardId && !showNewCardForm) return true;
      return cardNumber.replace(/\s/g, "").length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= 3 && cardHolder.trim().length > 0;
    }
    if (paymentMethod === "bancolombia_transfer") return true;
    return false;
  };

  const handlePayNow = async () => {
    if (!termsAccepted || !isPaymentValid()) return;
    setProcessing(true);
    setError("");

    try {
      let cardSaveInfo: PendingCardSave | null = null;
      const purchaseData: Parameters<typeof purchaseTickets>[0] = {
        eventId: data.eventId,
        attendees: data.attendees.map((a) => ({
          name: a.name,
          email: a.email,
          phone: a.phone || undefined,
          dateOfBirth: a.dateOfBirth || undefined,
          sex: (a.sex as "male" | "female") || undefined,
          idDocument: a.idDocument || undefined,
          ticketTypeId: data.ticketTypeId,
          shirtSize: (a as any).shirtSize || undefined,
        })),
        unitSelections: data.unitSelections,
        paymentMethod,
        turnstileToken: isGuest ? turnstileToken : undefined,
      };

      if (paymentMethod === "nequi") {
        purchaseData.phoneNumber = nequiPhone.replace(/\s/g, "");
      } else if (paymentMethod === "daviplata") {
        purchaseData.phoneNumber = daviplataPhone.replace(/\s/g, "");
      } else if (paymentMethod === "puntoscolombia") {
        purchaseData.phoneNumber = puntosPhone.replace(/\s/g, "");
        purchaseData.userLegalIdType = puntosLegalIdType;
        purchaseData.userLegalId = puntosLegalId.trim();
      } else if (paymentMethod === "pse") {
        purchaseData.bankCode = pseBank;
        purchaseData.userLegalId = pseLegalId;
        purchaseData.userLegalIdType = pseLegalIdType;
        purchaseData.phoneNumber = psePhone.replace(/\s/g, "");
        purchaseData.pseUserType = parseInt(pseUserType, 10) as 0 | 1;
        purchaseData.pseEmail = pseEmail.trim();
      } else if (paymentMethod === "card") {
        purchaseData.browserInfo = {
          browser_color_depth: String(window.screen.colorDepth ?? 24),
          browser_screen_height: String(window.screen.height),
          browser_screen_width: String(window.screen.width),
          browser_language: navigator.language || "es-CO",
          browser_user_agent: navigator.userAgent,
          browser_tz: String(-new Date().getTimezoneOffset()),
        };
        if (selectedSavedCardId && !showNewCardForm) {
          purchaseData.savedCardId = selectedSavedCardId;
          purchaseData.installments = 1;
        } else {
          const wompiConfig = await getWompiConfig();
          const [expMonth, expYear] = cardExpiry.split("/");
          const tokenRes = await fetch(`${wompiConfig.baseUrl}/tokens/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${wompiConfig.publicKey}` },
            body: JSON.stringify({
              number: cardNumber.replace(/\s/g, ""),
              cvc: cardCvc,
              exp_month: expMonth?.trim() ?? "",
              exp_year: expYear?.trim() ?? "",
              card_holder: cardHolder.trim(),
            }),
          });
          const tokenData = await tokenRes.json() as { data?: { id?: string; brand?: string; last_four?: string; card_holder?: string; exp_month?: string; exp_year?: string }; status?: string };
          if (!tokenRes.ok || !tokenData.data?.id) {
            throw new Error(t("checkout.errorCardTokenize"));
          }
          purchaseData.cardToken = tokenData.data.id;
          purchaseData.installments = 1;

          const brand = detectCardBrand(cardNumber) ?? (tokenData.data.brand?.toLowerCase() ?? "");
          // Store card info locally — do NOT setState here to avoid showing the
          // save-card prompt before the purchase API call completes.
          if (!isGuest && tokenData.data.id) {
            cardSaveInfo = {
              wompiToken: tokenData.data.id,
              brand,
              lastFour: cardNumber.replace(/\s/g, "").slice(-4),
              cardHolderName: cardHolder.trim(),
              expiryMonth: expMonth?.trim() ?? "",
              expiryYear: expYear?.trim() ?? "",
            };
          }
        }
      }

      const result = await purchaseTickets(purchaseData);

      sessionStorage.removeItem("tapee_checkout");
      sessionStorage.setItem("tapee_order_id", result.orderId);
      sessionStorage.setItem("tapee_order_status", result.status);
      sessionStorage.setItem("tapee_payment_method", paymentMethod);

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      // Only show the save-card prompt after the purchase is confirmed and
      // sessionStorage is populated, so "No" always lands on a valid status page.
      if (cardSaveInfo) {
        pendingNavRef.current = "/payment-status";
        setPendingCardSave(cardSaveInfo);
        setProcessing(false);
        return;
      }

      navigate("/payment-status");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.errorProcessing"));
      setProcessing(false);
    }
  };

  const handleSaveCard = async () => {
    if (!pendingCardSave) {
      navigate(pendingNavRef.current ?? "/payment-status");
      return;
    }
    setSavingCard(true);
    try {
      await saveCard({ ...pendingCardSave, alias: saveAlias.trim() || undefined });
    } catch {
    }
    setSavingCard(false);
    setPendingCardSave(null);
    navigate(pendingNavRef.current ?? "/payment-status");
  };

  const handleSkipSave = () => {
    setPendingCardSave(null);
    navigate(pendingNavRef.current ?? "/payment-status");
  };

  if (pendingCardSave) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Guardar tarjeta</h2>
              <p className="text-xs text-muted-foreground">Para futuros pagos</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
            <CardBrandLogo brand={pendingCardSave.brand as CardBrand} className="h-6 w-auto" />
            <span className="text-sm font-medium">
              {brandLabel(pendingCardSave.brand)} •••• {pendingCardSave.lastFour}
            </span>
          </div>

          <div className="space-y-1">
            <Label className="text-sm">Alias (opcional)</Label>
            <Input
              value={saveAlias}
              onChange={(e) => setSaveAlias(e.target.value)}
              placeholder="Ej: Mi Visa personal"
              maxLength={100}
              disabled={savingCard}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleSkipSave} disabled={savingCard}>
              Omitir
            </Button>
            <Button className="flex-1" onClick={handleSaveCard} disabled={savingCard}>
              {savingCard ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const methods = [
    { id: "nequi" as const, icon: null, label: t("checkout.nequi") },
    { id: "pse" as const, icon: null, label: t("checkout.pse") },
    { id: "card" as const, icon: CreditCard, label: t("checkout.card") },
    { id: "bancolombia_transfer" as const, icon: null, label: "Bancolombia" },
    { id: "daviplata" as const, icon: null, label: "Daviplata" },
    { id: "puntoscolombia" as const, icon: null, label: "Puntos Colombia" },
  ];

  return (
    <div className="min-h-screen">
      <SEO noindex />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("checkout.title")}</h1>

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">{t("checkout.orderSummary")}</h2>
              <p className="text-sm text-muted-foreground mb-3">{data.eventName}</p>
              <div className="space-y-3">
                {data.attendees.map((attendee, i) => (
                  <div key={i} className="p-3 bg-muted/30 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">{t("ticketSelection.ticket")} {i + 1}</span>
                      <span>{formatPrice(data.price, data.currencyCode, i18n.language)}</span>
                    </div>
                    <p className="text-muted-foreground">{data.ticketTypeName} — {data.sectionName}</p>
                    {data.selectedUnitLabel && (
                      <p className="text-muted-foreground font-medium">{data.selectedUnitLabel}</p>
                    )}
                    <p className="text-muted-foreground">{t("checkout.validDays")}: {data.validDays}</p>
                    <p className="text-muted-foreground">{t("checkout.attendee")}: {attendee.name} ({attendee.email})</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">{t("checkout.paymentMethod")}</h2>

              {!isGuest && savedCards.length > 0 && paymentMethod === "card" && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarjetas guardadas</p>
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                        selectedSavedCardId === card.id && !showNewCardForm
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => { setSelectedSavedCardId(card.id); setShowNewCardForm(false); }}
                      disabled={processing}
                    >
                      <CardBrandLogo brand={card.brand as CardBrand} className="h-6 w-auto" />
                      <span className="text-sm font-medium flex-1">
                        {card.alias || brandLabel(card.brand)} •••• {card.lastFour}
                      </span>
                      {selectedSavedCardId === card.id && !showNewCardForm && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                  <button
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      showNewCardForm ? "border-primary bg-primary/5" : "border-dashed border-border hover:border-primary/50"
                    }`}
                    onClick={() => { setShowNewCardForm(true); setSelectedSavedCardId(null); }}
                    disabled={processing}
                  >
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Usar nueva tarjeta</span>
                    {showNewCardForm && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                </div>
              )}

              <div className="space-y-2 mb-4">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      paymentMethod === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setPaymentMethod(m.id)}
                    disabled={processing}
                  >
                    {m.id === "nequi" ? <NequiIcon className="w-5 h-5" /> : m.id === "bancolombia_transfer" ? <BancolombiaIcon className="w-5 h-5" /> : m.id === "daviplata" ? <DaviplataIcon className="h-4 w-auto" /> : m.id === "puntoscolombia" ? <PuntosColombiaIcon className="h-4 w-auto" /> : m.id === "pse" ? <PseIcon className="w-5 h-5" /> : m.icon ? <m.icon className="w-5 h-5" /> : null}
                    <span className="text-sm font-medium">{m.label}</span>
                    {paymentMethod === m.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
              </div>

              {paymentMethod === "nequi" && (
                <div className="space-y-2">
                  <Label>{t("checkout.nequiPhone")}</Label>
                  <Input
                    type="tel"
                    value={nequiPhone}
                    onChange={(e) => setNequiPhone(e.target.value)}
                    placeholder="3001234567"
                    maxLength={10}
                    disabled={processing}
                  />
                  <p className="text-xs text-muted-foreground">{t("checkout.nequiHint")}</p>
                </div>
              )}

              {paymentMethod === "daviplata" && (
                <div className="space-y-2">
                  <Label>{t("checkout.daviplataPhone")}</Label>
                  <Input
                    type="tel"
                    value={daviplataPhone}
                    onChange={(e) => setDaviplataPhone(e.target.value)}
                    placeholder="3001234567"
                    maxLength={10}
                    disabled={processing}
                  />
                  <p className="text-xs text-muted-foreground">{t("checkout.daviplataHint")}</p>
                </div>
              )}

              {paymentMethod === "puntoscolombia" && (
                <div className="space-y-4">
                  <div>
                    <Label>{t("checkout.puntosPhone")}</Label>
                    <Input
                      type="tel"
                      value={puntosPhone}
                      onChange={(e) => setPuntosPhone(e.target.value)}
                      placeholder="3001234567"
                      maxLength={10}
                      disabled={processing}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("checkout.puntosHint")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("checkout.docType")}</Label>
                      <Select value={puntosLegalIdType} onValueChange={(v) => setPuntosLegalIdType(v as "CC" | "CE" | "NIT" | "PP" | "TI")} disabled={processing}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CC">{t("checkout.cc")}</SelectItem>
                          <SelectItem value="CE">{t("checkout.ce")}</SelectItem>
                          <SelectItem value="NIT">NIT</SelectItem>
                          <SelectItem value="PP">{t("checkout.passport")}</SelectItem>
                          <SelectItem value="TI">{t("checkout.ti")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("checkout.docNumber")}</Label>
                      <Input
                        value={puntosLegalId}
                        onChange={(e) => setPuntosLegalId(e.target.value)}
                        placeholder="123456789"
                        disabled={processing}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "pse" && (
                <div className="space-y-4">
                  <div>
                    <Label>{t("checkout.personType")}</Label>
                    <Select value={pseUserType} onValueChange={(v) => setPseUserType(v as "0" | "1")} disabled={processing}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{t("checkout.naturalPerson")}</SelectItem>
                        <SelectItem value="1">{t("checkout.legalEntity")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("checkout.bank")}</Label>
                    <Select value={pseBank} onValueChange={setPseBank} disabled={processing || pseBanksLoading}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={pseBanksLoading ? t("checkout.loadingBanks") : t("checkout.selectBank")} />
                      </SelectTrigger>
                      <SelectContent>
                        {pseBanks.map((bank) => (
                          <SelectItem key={bank.financial_institution_code} value={bank.financial_institution_code}>{bank.financial_institution_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("checkout.contactPhone")}</Label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={psePhone}
                      onChange={(e) => setPsePhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="3001234567"
                      className="mt-1"
                      maxLength={15}
                      disabled={processing}
                    />
                  </div>
                  <div>
                    <Label>{t("checkout.pseEmail")}</Label>
                    <Input
                      type="email"
                      inputMode="email"
                      value={pseEmail}
                      onChange={(e) => setPseEmail(e.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                      className="mt-1"
                      disabled={processing}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("checkout.pseEmailHint")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("checkout.docType")}</Label>
                      <Select value={pseLegalIdType} onValueChange={(v) => setPseLegalIdType(v as typeof pseLegalIdType)} disabled={processing}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CC">{t("checkout.cc")}</SelectItem>
                          <SelectItem value="CE">{t("checkout.ce")}</SelectItem>
                          <SelectItem value="NIT">NIT</SelectItem>
                          <SelectItem value="PP">{t("checkout.passport")}</SelectItem>
                          <SelectItem value="TI">{t("checkout.ti")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("checkout.docNumber")}</Label>
                      <Input
                        type="text"
                        value={pseLegalId}
                        onChange={(e) => setPseLegalId(e.target.value)}
                        placeholder="1234567890"
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "card" && usingNewCard && (
                <div className="space-y-3">
                  <div>
                    <Label>{t("checkout.cardNumber")}</Label>
                    <div className="relative mt-1">
                      <Input
                        ref={cardInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        value={cardNumber}
                        onChange={(e) => {
                          const brand = detectCardBrand(e.target.value);
                          setCardNumber(formatCardNumber(e.target.value, brand));
                        }}
                        placeholder="1234 5678 9012 3456"
                        maxLength={detectCardBrand(cardNumber) === "amex" ? 17 : 19}
                        className="font-mono pr-16"
                        disabled={processing}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                        <CardBrandLogo brand={detectCardBrand(cardNumber)} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("checkout.expiry")}</Label>
                      <Input
                        type="text"
                        autoComplete="cc-exp"
                        value={cardExpiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/[^\d/]/g, "");
                          if (v.length === 2 && !v.includes("/") && cardExpiry.length === 1) v = v + "/";
                          const parts = v.split("/");
                          if (parts[1] && parts[1].length === 4) v = parts[0] + "/" + parts[1].slice(2);
                          setCardExpiry(v.slice(0, 5));
                        }}
                        placeholder="12/28"
                        maxLength={5}
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <Label>CVC</Label>
                      <Input
                        type="password"
                        autoComplete="cc-csc"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="•••"
                        maxLength={4}
                        className="mt-1"
                        disabled={processing}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t("checkout.cardHolder")}</Label>
                    <Input
                      type="text"
                      autoComplete="cc-name"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="NOMBRE APELLIDO"
                      className="mt-1 uppercase"
                      disabled={processing}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("checkout.cardSecurity")}
                  </p>
                </div>
              )}

              {paymentMethod === "bancolombia_transfer" && (
                <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                  {t("checkout.bancolombiaHint")}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-20 space-y-3">
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="bg-primary/5 border-b border-border px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("checkout.orderSummary")}</p>
                    <p className="font-semibold text-sm truncate">{data.eventName}</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{data.ticketTypeName} × {data.quantity}</span>
                      <span>{formatPrice(data.subtotal, data.currencyCode, i18n.language)}</span>
                    </div>
                    {data.serviceFee > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t("checkout.serviceFee")}</span>
                        <span>{formatPrice(data.serviceFee, data.currencyCode, i18n.language)}</span>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{t("checkout.total")}</span>
                    <span className="text-primary font-bold text-xl">{formatPrice(data.total, data.currencyCode, i18n.language)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(!!checked)}
                    disabled={processing}
                  />
                  <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer leading-tight">
                    {t("checkout.terms")}
                  </label>
                </div>

                {isGuest && (
                  <Turnstile onToken={setTurnstileToken} />
                )}

                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,241,255,0.2)] hover:shadow-[0_0_28px_rgba(0,241,255,0.35)] transition-shadow"
                  size="lg"
                  disabled={!termsAccepted || processing || !isPaymentValid() || (isGuest && !turnstileToken)}
                  onClick={handlePayNow}
                >
                  {processing ? t("checkout.processing") : t("checkout.payNow")}
                </Button>
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3" />
                  <span>{t("checkout.securePayment")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
