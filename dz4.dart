void main() {
    welcome();
    print('-----------------------');

    List<String> towar = ['яблоко', 'хлеб', 'молоко'];

    towar.forEach((item) {
        print('сейчас в магазине из товаров есть $item');
    });

    print('-----------------------');
    product();
    

}

void welcome() {
    print('здравствуйте');
}

double calculateTotal(double price, int count) {
  return price * count;

}

void greet(double total) {
    print('итого с вас $total сом');

}

void applyDiscount({required double total, double discount = 10}) {
  double discountedTotal = total * (1 - discount / 100);
  print('Итого с учетом скидки $discount%: $discountedTotal сом');
}

void executeWithTotal(double total, void Function({required double total, double discount}) action) {
  print('--- Запуск процесса обработки суммы ---');
  action(total: total); 
}

void product() {
    String towar = 'яблоко';
    double price = 1000.5;
    int count = 5;

    print('вы взяли $towar');
    print('всего $count штук');
    print('стоимость одного яблока $price сом');
  
   double total = calculateTotal(price, count);

    print('обшая сумма покупок составила $total сом');
    greet(total);
    applyDiscount(total: total);
    print('--------------------------------------------');
    executeWithTotal(total, applyDiscount);
    
  
}


